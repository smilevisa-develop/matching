/**
 * パートナーへ 1 件のメッセージを送信する。
 * - lineUserId があれば LINE Messaging API
 * - 無くて messengerPsid があれば Facebook Messenger Graph API
 * - 送信成功した場合のみ Message テーブルに outbound 記録
 * - 本文中の {{パートナー名}} {{急ぎ案件一覧}} 等の変数を実データで展開してから送信
 *
 * (パス名は send-person との対称のために "line" 配下だが、実際は LINE / Messenger 両方扱う)
 */
import { prisma } from "@/lib/prisma";
import {
  expandTemplate,
  dealToBroadcast,
  OPEN_DEAL_STATUSES,
  URGENT_DEAL_STATUSES,
  type PartnerForBroadcast,
} from "@/lib/broadcast-variables";

/** 配信用の案件スナップショットを 1 回だけ取得 */
async function loadDealSnapshot() {
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
    const { partnerId, message } = await req.json();
    if (!partnerId || !message?.trim()) {
      return Response.json(
        { ok: false, error: "partnerId と message は必須です" },
        { status: 400 }
      );
    }

    const partner = await prisma.partner.findUnique({
      where: { id: Number(partnerId) },
      include: {
        lineGroups: {
          where: { isActive: true },
          orderBy: { lastSeenAt: "desc" },
          take: 1,
        },
      },
    });
    if (!partner) {
      return Response.json(
        { ok: false, error: "パートナーが見つかりません" },
        { status: 404 }
      );
    }
    const linkedGroup = partner.lineGroups[0] ?? null;

    // {{変数}} の展開
    let expandedMessage = message as string;
    if (expandedMessage.includes("{{")) {
      const { openDeals, urgentDeals } = await loadDealSnapshot();
      const ctx: PartnerForBroadcast = {
        name: partner.name,
        contactName: partner.contactName,
        country: partner.country,
        introducibleFields: partner.introducibleFields,
      };
      expandedMessage = expandTemplate(expandedMessage, { partner: ctx, openDeals, urgentDeals });
    }

    // 1️⃣ LINE グループ優先 → 2️⃣ 個人 LINE → 3️⃣ Messenger
    const lineSendTo = linkedGroup?.groupId ?? partner.lineUserId ?? null;
    if (lineSendTo) {
      const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
      if (!token) {
        return Response.json(
          { ok: false, error: "LINE_CHANNEL_ACCESS_TOKEN が未設定です" },
          { status: 500 }
        );
      }
      const res = await fetch("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          to: lineSendTo,
          messages: [{ type: "text", text: expandedMessage }],
        }),
      });
      if (!res.ok) {
        return Response.json(
          { ok: false, error: "LINE 送信に失敗しました", body: await res.text() },
          { status: 500 }
        );
      }
      const channel = linkedGroup ? "LINE-Group" : "LINE";
      await prisma.message.create({
        data: {
          partnerId: partner.id,
          channel,
          direction: "outbound",
          content: expandedMessage,
          externalId: lineSendTo,
        },
      });
      return Response.json({ ok: true, channel, content: expandedMessage });
    }

    if (partner.messengerPsid) {
      const fbToken = process.env.FB_PAGE_ACCESS_TOKEN;
      if (!fbToken) {
        return Response.json(
          { ok: false, error: "FB_PAGE_ACCESS_TOKEN が未設定です" },
          { status: 500 }
        );
      }
      const res = await fetch(
        `https://graph.facebook.com/v22.0/me/messages?access_token=${encodeURIComponent(
          fbToken
        )}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipient: { id: partner.messengerPsid },
            messaging_type: "RESPONSE",
            message: { text: expandedMessage },
          }),
        }
      );
      if (!res.ok) {
        return Response.json(
          {
            ok: false,
            error: "Messenger 送信に失敗しました (24h ウィンドウ外の可能性)",
            body: await res.text(),
          },
          { status: 500 }
        );
      }
      await prisma.message.create({
        data: {
          partnerId: partner.id,
          channel: "Messenger",
          direction: "outbound",
          content: expandedMessage,
          externalId: partner.messengerPsid,
        },
      });
      return Response.json({ ok: true, channel: "Messenger", content: expandedMessage });
    }

    return Response.json(
      { ok: false, error: "このパートナーには LINE / Messenger ID が登録されていません" },
      { status: 400 }
    );
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : "error" },
      { status: 500 }
    );
  }
}
