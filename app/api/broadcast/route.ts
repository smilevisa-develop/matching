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
    orderBy: { id: "asc" },
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
    const lineToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    const fbPageToken = process.env.FB_PAGE_ACCESS_TOKEN;
    if (!lineToken && !fbPageToken) {
      return Response.json(
        { ok: false, error: "LINE_CHANNEL_ACCESS_TOKEN または FB_PAGE_ACCESS_TOKEN が未設定です" },
        { status: 500 }
      );
    }

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

    // 即時送信: LINE があれば LINE、なければ Messenger を試す
    let sentCount = 0;
    let sentLine = 0;
    let sentMessenger = 0;
    let failedCount = 0;
    let skippedCount = 0;
    const failures: { name: string; channel: string; error: string }[] = [];

    /** LINE で送る */
    const sendLine = async (to: string, text: string): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (!lineToken) return { ok: false, error: "LINE_CHANNEL_ACCESS_TOKEN 未設定" };
      const res = await fetch("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${lineToken}` },
        body: JSON.stringify({ to, messages: [{ type: "text", text }] }),
      });
      if (res.ok) return { ok: true };
      return { ok: false, error: await res.text() };
    };

    /** Messenger (Facebook Graph API) で送る */
    const sendMessenger = async (psid: string, text: string): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (!fbPageToken) return { ok: false, error: "FB_PAGE_ACCESS_TOKEN 未設定" };
      // 24h ウィンドウ内ならタグなしで送れる。範囲外だと Meta が 10/200 エラーを返す。
      const res = await fetch(
        `https://graph.facebook.com/v22.0/me/messages?access_token=${encodeURIComponent(fbPageToken)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipient: { id: psid },
            messaging_type: "RESPONSE",
            message: { text },
          }),
        }
      );
      if (res.ok) return { ok: true };
      return { ok: false, error: await res.text() };
    };

    for (const t of targets) {
      const personalizedMessage = renderFor(t);

      // LINE 優先
      if (t.lineUserId) {
        const r = await sendLine(t.lineUserId, personalizedMessage);
        if (r.ok) {
          sentCount++;
          sentLine++;
        } else {
          failedCount++;
          failures.push({ name: t.name, channel: "LINE", error: r.error });
        }
        continue;
      }

      // LINE が無ければ Messenger
      if (t.messengerPsid) {
        const r = await sendMessenger(t.messengerPsid, personalizedMessage);
        if (r.ok) {
          sentCount++;
          sentMessenger++;
        } else {
          failedCount++;
          failures.push({ name: t.name, channel: "Messenger", error: r.error });
        }
        continue;
      }

      // WhatsApp は今のところ未対応
      if (t.whatsappId) {
        skippedCount++;
        failures.push({ name: t.name, channel: "WhatsApp", error: "WhatsApp は未対応" });
        continue;
      }

      failedCount++;
      failures.push({ name: t.name, channel: "-", error: "連絡先 ID 未登録" });
    }

    await prisma.messageLog.create({
      data: {
        title: "一斉配信 (パートナー)",
        body: message,
        channel: "LINE+Messenger",
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

    return Response.json({
      ok: true,
      sentCount,
      sentLine,
      sentMessenger,
      failedCount,
      skippedCount,
    });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
