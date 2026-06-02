/**
 * パートナーへ 1 件のメッセージを送信する。
 * - lineUserId があれば LINE Messaging API
 * - 無くて messengerPsid があれば Facebook Messenger Graph API
 * - 送信成功した場合のみ Message テーブルに outbound 記録
 *
 * (パス名は send-person との対称のために "line" 配下だが、実際は LINE / Messenger 両方扱う)
 */
import { prisma } from "@/lib/prisma";

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
    });
    if (!partner) {
      return Response.json(
        { ok: false, error: "パートナーが見つかりません" },
        { status: 404 }
      );
    }

    // LINE 優先 → Messenger フォールバック
    if (partner.lineUserId) {
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
          to: partner.lineUserId,
          messages: [{ type: "text", text: message }],
        }),
      });
      if (!res.ok) {
        return Response.json(
          { ok: false, error: "LINE 送信に失敗しました", body: await res.text() },
          { status: 500 }
        );
      }
      await prisma.message.create({
        data: {
          partnerId: partner.id,
          channel: "LINE",
          direction: "outbound",
          content: message,
          externalId: partner.lineUserId,
        },
      });
      return Response.json({ ok: true, channel: "LINE" });
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
            message: { text: message },
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
          content: message,
          externalId: partner.messengerPsid,
        },
      });
      return Response.json({ ok: true, channel: "Messenger" });
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
