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
      templateId,
    } = body as {
      mode: "filter" | "group";
      relationshipStatus: string | null;
      introNationality: string | null;
      introField: string | null;
      groupId: number | null;
      message: string;
      scheduledAt: string | null;
      /** MessageTemplate.id を渡すと、WhatsApp ではそのテンプレ承認名で送信できる */
      templateId?: number | null;
    };
    const lineToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    const fbPageToken = process.env.FB_PAGE_ACCESS_TOKEN;
    const waToken = process.env.WA_ACCESS_TOKEN;
    const waPhoneNumberId = process.env.WA_PHONE_NUMBER_ID;
    if (!lineToken && !fbPageToken && !waToken) {
      return Response.json(
        { ok: false, error: "LINE / FB / WhatsApp いずれの送信トークンも未設定です" },
        { status: 500 }
      );
    }

    // 選択テンプレ (WhatsApp テンプレ名がある場合のみ意味を持つ)
    const tmpl = templateId
      ? await prisma.messageTemplate.findUnique({ where: { id: templateId } })
      : null;
    const waTemplate =
      tmpl?.whatsappTemplateName && tmpl?.whatsappTemplateLang
        ? {
            name: tmpl.whatsappTemplateName,
            lang: tmpl.whatsappTemplateLang,
            paramKeys: (tmpl.whatsappTemplateParams ?? "")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          }
        : null;

    // 対象パートナー取得
    type Target = {
      id: number;
      name: string;
      contactName: string | null;
      country: string | null;
      introducibleFields: string | null;
      lineUserId: string | null;
      /** 紐づけ済み LINE グループの groupId (会社単位の配信先) */
      lineGroupId: string | null;
      messengerPsid: string | null;
      whatsappId: string | null;
    };
    let targets: Target[] = [];

    const includeLineGroups = {
      lineGroups: {
        where: { isActive: true },
        orderBy: { lastSeenAt: "desc" as const },
        take: 1,
      },
    };

    if (mode === "group" && groupId) {
      const group = await prisma.group.findUnique({
        where: { id: groupId },
        include: { members: { include: { partner: { include: includeLineGroups } } } },
      });
      targets = (group?.members ?? []).map((m) => ({
        id: m.partner.id,
        name: m.partner.name,
        contactName: m.partner.contactName,
        country: m.partner.country,
        introducibleFields: m.partner.introducibleFields,
        lineUserId: m.partner.lineUserId,
        lineGroupId: m.partner.lineGroups[0]?.groupId ?? null,
        messengerPsid: m.partner.messengerPsid,
        whatsappId: m.partner.whatsappId,
      }));
    } else {
      const where: Record<string, unknown> = {};
      if (relationshipStatus) where.relationshipStatus = relationshipStatus;
      // CSV カラムは contains で簡易検索
      if (introNationality) where.introducibleNationalities = { contains: introNationality };
      if (introField) where.introducibleFields = { contains: introField };
      const partners = await prisma.partner.findMany({ where, include: includeLineGroups });
      targets = partners.map((p) => ({
        id: p.id,
        name: p.name,
        contactName: p.contactName,
        country: p.country,
        introducibleFields: p.introducibleFields,
        lineUserId: p.lineUserId,
        lineGroupId: p.lineGroups[0]?.groupId ?? null,
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

    // 即時送信: LINE → WhatsApp → Messenger の順で試す
    let sentCount = 0;
    let sentLine = 0;
    let sentWhatsapp = 0;
    let sentMessenger = 0;
    let failedCount = 0;
    let skippedCount = 0;
    const failures: { name: string; channel: string; error: string }[] = [];

    /** ヘルパー: 1 受信者ぶんの WhatsApp テンプレ用パラメータを組み立てる */
    const buildWaTemplateParams = (t: Target): string[] => {
      if (!waTemplate) return [];
      const partner: PartnerForBroadcast = {
        name: t.name,
        contactName: t.contactName,
        country: t.country,
        introducibleFields: t.introducibleFields,
      };
      // 変数キー (例: "急ぎ案件一覧") を {{xxx}} 文字列にラップして expandTemplate で 1 個ずつ展開
      return waTemplate.paramKeys.map((key) =>
        expandTemplate(`{{${key}}}`, { partner, openDeals, urgentDeals })
      );
    };

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

    /**
     * WhatsApp Cloud API で送る。
     * - テンプレ (waTemplate) が指定されていれば承認済みテンプレで送る (24h 縛りなし)
     * - 無ければ free-form text (24h 内のみ届く)
     */
    const sendWhatsapp = async (
      waId: string,
      text: string,
      templateParams: string[]
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (!waToken || !waPhoneNumberId) {
        return { ok: false, error: "WA_ACCESS_TOKEN / WA_PHONE_NUMBER_ID 未設定" };
      }
      const url = `https://graph.facebook.com/v22.0/${encodeURIComponent(
        waPhoneNumberId
      )}/messages`;
      let payload: Record<string, unknown>;
      if (waTemplate) {
        payload = {
          messaging_product: "whatsapp",
          to: waId,
          type: "template",
          template: {
            name: waTemplate.name,
            language: { code: waTemplate.lang },
            components:
              templateParams.length > 0
                ? [
                    {
                      type: "body",
                      parameters: templateParams.map((p) => ({
                        type: "text",
                        text: p,
                      })),
                    },
                  ]
                : [],
          },
        };
      } else {
        payload = {
          messaging_product: "whatsapp",
          to: waId,
          type: "text",
          text: { body: text },
        };
      }
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${waToken}`,
        },
        body: JSON.stringify(payload),
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

    let sentLineGroup = 0;
    for (const t of targets) {
      const personalizedMessage = renderFor(t);

      // 1️⃣ LINE グループ (パートナー会社の LINE グループ) 優先
      if (t.lineGroupId) {
        const r = await sendLine(t.lineGroupId, personalizedMessage);
        if (r.ok) {
          sentCount++;
          sentLineGroup++;
        } else {
          failedCount++;
          failures.push({ name: t.name, channel: "LINE-Group", error: r.error });
        }
        continue;
      }

      // 2️⃣ 個人 LINE
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

      // LINE が無ければ WhatsApp
      if (t.whatsappId) {
        const params = buildWaTemplateParams(t);
        const r = await sendWhatsapp(t.whatsappId, personalizedMessage, params);
        if (r.ok) {
          sentCount++;
          sentWhatsapp++;
        } else {
          failedCount++;
          failures.push({ name: t.name, channel: "WhatsApp", error: r.error });
        }
        continue;
      }

      // WhatsApp も無ければ Messenger
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
      sentLineGroup,
      sentLine,
      sentWhatsapp,
      sentMessenger,
      failedCount,
      skippedCount,
    });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
