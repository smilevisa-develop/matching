import { prisma } from "@/lib/prisma";
import {
  expandTemplate,
  dealToBroadcast,
  OPEN_DEAL_STATUSES,
  URGENT_DEAL_STATUSES,
  type DealForBroadcast,
  type PartnerForBroadcast,
} from "@/lib/broadcast-variables";

/** 配信時の案件スナップショットを 1 回だけ取得 */
async function loadDealSnapshot(): Promise<{
  openDeals: DealForBroadcast[];
  urgentDeals: DealForBroadcast[];
}> {
  const deals = await prisma.deal.findMany({
    where: { status: { in: [...OPEN_DEAL_STATUSES] } },
    include: { company: { select: { name: true } } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
  const mapped = deals.map(dealToBroadcast);
  return {
    openDeals: mapped,
    urgentDeals: mapped.filter((d) =>
      (URGENT_DEAL_STATUSES as readonly string[]).includes(d.status),
    ),
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      mode,
      relationshipStatus,
      introNationality,
      introField,
      groupId,
      message,
      scheduledAt,
    } = body as {
      mode: "filter" | "group";
      relationshipStatus: string | null;
      introNationality: string | null;
      introField: string | null;
      groupId: number | null;
      message: string;
      scheduledAt: string | null;
    };
    const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    if (!token) return Response.json({ ok: false, error: "LINE_CHANNEL_ACCESS_TOKEN が未設定です" }, { status: 500 });

    // 対象パートナー取得
    type Target = {
      id: number;
      name: string;
      contactName: string | null;
      country: string | null;
      introducibleFields: string | null;
      lineUserId: string | null;
      messengerPsid: string | null;
      whatsappId: string | null;
    };
    let targets: Target[] = [];

    if (mode === "group" && groupId) {
      const group = await prisma.group.findUnique({
        where: { id: groupId },
        include: { members: { include: { partner: true } } },
      });
      targets = (group?.members ?? []).map((m) => ({
        id: m.partner.id,
        name: m.partner.name,
        contactName: m.partner.contactName,
        country: m.partner.country,
        introducibleFields: m.partner.introducibleFields,
        lineUserId: m.partner.lineUserId,
        messengerPsid: m.partner.messengerPsid,
        whatsappId: m.partner.whatsappId,
      }));
    } else {
      const where: Record<string, unknown> = {};
      if (relationshipStatus) where.relationshipStatus = relationshipStatus;
      // CSV カラムは contains で簡易検索
      if (introNationality) where.introducibleNationalities = { contains: introNationality };
      if (introField) where.introducibleFields = { contains: introField };
      const partners = await prisma.partner.findMany({ where });
      targets = partners.map((p) => ({
        id: p.id,
        name: p.name,
        contactName: p.contactName,
        country: p.country,
        introducibleFields: p.introducibleFields,
        lineUserId: p.lineUserId,
        messengerPsid: p.messengerPsid,
        whatsappId: p.whatsappId,
      }));
    }

    // 変数展開のため案件スナップショットを 1 回ロード
    const { openDeals, urgentDeals } = await loadDealSnapshot();
    const renderFor = (t: Target): string => {
      const partner: PartnerForBroadcast = {
        name: t.name,
        contactName: t.contactName,
        country: t.country,
        introducibleFields: t.introducibleFields,
      };
      return expandTemplate(message, { partner, openDeals, urgentDeals });
    };

    if (scheduledAt) {
      await prisma.messageLog.create({
        data: {
          title: "予約配信 (パートナー)",
          body: message,
          channel: "LINE/Messenger/WhatsApp",
          targetFilter: JSON.stringify({
            mode,
            relationshipStatus,
            introNationality,
            introField,
            groupId,
          }),
          status: "scheduled",
          matchedCount: targets.length,
          sentCount: 0,
          skippedCount: 0,
          scheduledAt: new Date(scheduledAt),
        },
      });
      return Response.json({ ok: true, targetCount: targets.length, scheduledAt });
    }

    // 即時送信 (LINE Messaging API のみ。Messenger/WhatsApp は今後対応)
    let sentCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    const failures: { name: string; error: string }[] = [];

    for (const t of targets) {
      const to = t.lineUserId; // Messenger/WhatsApp は別 API なので未対応
      if (!to) {
        if (t.messengerPsid || t.whatsappId) {
          skippedCount++;
          failures.push({ name: t.name, error: "LINE 以外の連絡手段は未対応" });
        } else {
          failedCount++;
          failures.push({ name: t.name, error: "ID未登録" });
        }
        continue;
      }

      const personalizedMessage = renderFor(t);
      const res = await fetch("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ to, messages: [{ type: "text", text: personalizedMessage }] }),
      });

      if (res.ok) {
        sentCount++;
      } else {
        failedCount++;
        failures.push({ name: t.name, error: await res.text() });
      }
    }

    await prisma.messageLog.create({
      data: {
        title: "一斉配信 (パートナー)",
        body: message,
        channel: "LINE",
        targetFilter: JSON.stringify({
          mode,
          relationshipStatus,
          introNationality,
          introField,
          groupId,
        }),
        status: "done",
        matchedCount: targets.length,
        sentCount,
        skippedCount,
        failedCount,
        failures: failures.length > 0 ? failures : undefined,
      },
    });

    return Response.json({ ok: true, sentCount, failedCount, skippedCount });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
