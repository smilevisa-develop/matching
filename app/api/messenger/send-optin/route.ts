/**
 * Messenger Recurring Notifications の opt-in (購読同意) カードを
 * 指定パートナーへ送信する。
 *
 * 制約:
 *   - 当該パートナーが 過去 24 時間以内に弊社 Page へ DM していること
 *     (Meta の 24h ウィンドウ内でしか送れない)
 *
 * 受信側 (パートナー) には: 「求人情報の定期通知」を購読するボタン付きの
 * リッチカードが Messenger に届く。タップ → 頻度選択 → 完了。
 *
 * 完了すると webhook 経由で messenger.webhook が opt-in token を保存し、
 * 以降 24h 関係なく push できるようになる。
 *
 * 使い方:
 *   POST /api/messenger/send-optin
 *   Body: { partnerId: number, frequency?: "DAILY"|"WEEKLY"|"MONTHLY", title?: string }
 */
import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    await requireApiAccount();
    const body = (await req.json()) as {
      partnerId: number;
      frequency?: "DAILY" | "WEEKLY" | "MONTHLY";
      title?: string;
      imageUrl?: string;
    };

    const fbToken = process.env.FB_PAGE_ACCESS_TOKEN;
    if (!fbToken) {
      return Response.json({ ok: false, error: "FB_PAGE_ACCESS_TOKEN が未設定です" }, { status: 500 });
    }

    const partner = await prisma.partner.findUnique({
      where: { id: Number(body.partnerId) },
    });
    if (!partner) {
      return Response.json({ ok: false, error: "パートナーが見つかりません" }, { status: 404 });
    }
    if (!partner.messengerPsid) {
      return Response.json(
        { ok: false, error: "このパートナーには Messenger PSID が登録されていません" },
        { status: 400 }
      );
    }

    const frequency = body.frequency ?? "WEEKLY";
    const title = body.title ?? "求人情報の定期通知";

    // Meta API: notification_messages テンプレで購読カードを送信
    // https://developers.facebook.com/docs/messenger-platform/send-messages/recurring-notifications
    const payload = {
      recipient: { id: partner.messengerPsid },
      message: {
        attachment: {
          type: "template",
          payload: {
            template_type: "notification_messages",
            title,
            // 任意の自由メタ。webhook の optin.payload で返るので
            // ここで partnerId をつけておけば webhook 側で対応取りやすい
            payload: `partner:${partner.id}`,
            notification_messages_frequency: frequency,
            notification_messages_reoptin: "ENABLED",
            ...(body.imageUrl ? { image_url: body.imageUrl } : {}),
          },
        },
      },
    };

    const res = await fetch(
      `https://graph.facebook.com/v22.0/me/messages?access_token=${encodeURIComponent(fbToken)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );

    if (!res.ok) {
      const errBody = await res.text();
      return Response.json(
        {
          ok: false,
          error:
            "opt-in カード送信失敗。多くの場合 24h ウィンドウ外 (パートナーから直近 24h 内に DM 来ていない) です。",
          metaResponse: errBody,
        },
        { status: 500 }
      );
    }

    return Response.json({ ok: true, partnerId: partner.id, frequency });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 }
    );
  }
}
