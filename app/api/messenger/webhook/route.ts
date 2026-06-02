/**
 * Messenger Webhook (Meta Page → SMILE MATCHING)
 *
 * Meta for Developers の Webhooks 設定で:
 *   Callback URL = https://matching.up.railway.app/api/messenger/webhook
 *   Verify Token  = FB_VERIFY_TOKEN (Railway 環境変数)
 *   購読フィールド = messages, messaging_postbacks
 *
 * GET  : Meta の検証 (hub.challenge エコー)
 * POST : ユーザー → Page へのメッセージ受信 (sender.id = PSID を MessengerProfile に保存)
 *
 * ※ /api/messenger/webhook は proxy.ts で認証バイパス済み
 */
import crypto from "crypto";
import { prisma } from "@/lib/prisma";

// 検証 (Meta が Webhook 登録時に呼ぶ)
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expected = process.env.FB_VERIFY_TOKEN;

  if (!expected) {
    console.error("[messenger/webhook] FB_VERIFY_TOKEN が未設定です");
    return new Response("misconfigured", { status: 500 });
  }
  if (mode === "subscribe" && token === expected && challenge) {
    return new Response(challenge, { status: 200 });
  }
  return new Response("forbidden", { status: 403 });
}

type MessengerEvent = {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
  };
  postback?: {
    title?: string;
    payload?: string;
  };
  delivery?: unknown;
  read?: unknown;
};
type MessengerWebhookPayload = {
  object?: string;
  entry?: { id?: string; time?: number; messaging?: MessengerEvent[] }[];
};

function eventType(ev: MessengerEvent): string {
  if (ev.message?.is_echo) return "echo";
  if (ev.message) return "message";
  if (ev.postback) return "postback";
  if (ev.delivery) return "delivery";
  if (ev.read) return "read";
  return "other";
}

export async function POST(req: Request) {
  const raw = await req.text();

  // 署名検証 (FB_APP_SECRET が設定されていれば実施)
  const appSecret = process.env.FB_APP_SECRET;
  if (appSecret) {
    const sig = req.headers.get("x-hub-signature-256") ?? "";
    const expected =
      "sha256=" +
      crypto.createHmac("sha256", appSecret).update(raw).digest("hex");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      console.warn("[messenger/webhook] 署名検証失敗");
      return new Response("invalid signature", { status: 401 });
    }
  }

  let payload: MessengerWebhookPayload;
  try {
    payload = JSON.parse(raw) as MessengerWebhookPayload;
  } catch {
    return new Response("bad json", { status: 400 });
  }

  if (payload?.object !== "page") {
    // page 以外は無視 (200 を返してリトライさせない)
    return new Response("ignored", { status: 200 });
  }

  let upserts = 0;
  for (const entry of payload.entry ?? []) {
    for (const ev of entry.messaging ?? []) {
      // echo (自分が送ったメッセージのコールバック) は無視
      if (ev.message?.is_echo) continue;
      const psid = ev.sender?.id;
      if (!psid) continue;
      const text = ev.message?.text ?? null;
      const type = eventType(ev);
      const seenAt = ev.timestamp ? new Date(ev.timestamp) : new Date();

      await prisma.messengerProfile.upsert({
        where: { psid },
        create: {
          psid,
          lastMessageText: text,
          lastWebhookType: type,
          lastSeenAt: seenAt,
        },
        update: {
          lastMessageText: text ?? undefined,
          lastWebhookType: type,
          lastSeenAt: seenAt,
        },
      });

      // 本文があれば Message として記録 (Partner 優先 → Person フォールバック)
      if (text) {
        const partner = await prisma.partner.findFirst({ where: { messengerPsid: psid } });
        const person = partner ? null : await prisma.person.findFirst({ where: { messengerPsid: psid } });
        await prisma.message.create({
          data: {
            partnerId: partner?.id ?? null,
            personId: person?.id ?? null,
            channel: "Messenger",
            direction: "inbound",
            content: text,
            externalId: psid,
            sentAt: seenAt,
          },
        });
      }
      upserts++;
    }
  }

  console.log(`[messenger/webhook] processed ${upserts} event(s)`);
  return new Response("ok", { status: 200 });
}
