/**
 * WhatsApp Cloud API Webhook (Meta → SMILE MATCHING)
 *
 * Meta WhatsApp Business Manager の Webhook 設定で:
 *   Callback URL = https://matching.up.railway.app/api/whatsapp/webhook
 *   Verify Token  = WA_VERIFY_TOKEN (Railway 環境変数)
 *   購読フィールド = messages, message_template_status_update
 *
 * GET  : Meta の検証 (hub.challenge エコー)
 * POST : ユーザー → ビジネス番号へのメッセージ受信
 *        entry[].changes[].value.messages[].from が WhatsApp ID (国コード込み番号)
 *
 * ※ /api/whatsapp/webhook は proxy.ts で認証バイパス済み
 */
import crypto from "crypto";
import { prisma } from "@/lib/prisma";

// 検証 (Meta が Webhook 登録時に呼ぶ)
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expected = process.env.WA_VERIFY_TOKEN;

  if (!expected) {
    console.error("[whatsapp/webhook] WA_VERIFY_TOKEN が未設定です");
    return new Response("misconfigured", { status: 500 });
  }
  if (mode === "subscribe" && token === expected && challenge) {
    return new Response(challenge, { status: 200 });
  }
  return new Response("forbidden", { status: 403 });
}

type WaContact = { profile?: { name?: string }; wa_id?: string };
type WaMessage = {
  from?: string;
  id?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  button?: { text?: string };
};
type WaValue = {
  messaging_product?: string;
  contacts?: WaContact[];
  messages?: WaMessage[];
  statuses?: unknown[];
};
type WaChange = { field?: string; value?: WaValue };
type WaEntry = { id?: string; changes?: WaChange[] };
type WaPayload = { object?: string; entry?: WaEntry[] };

function pickText(m: WaMessage): string | null {
  if (m.text?.body) return m.text.body;
  if (m.button?.text) return m.button.text;
  return null;
}

export async function POST(req: Request) {
  const raw = await req.text();

  // 署名検証 (FB_APP_SECRET が共通の場合はそれを使う / WA 専用に WA_APP_SECRET があればそちら)
  const appSecret = process.env.WA_APP_SECRET ?? process.env.FB_APP_SECRET;
  if (appSecret) {
    const sig = req.headers.get("x-hub-signature-256") ?? "";
    const expected =
      "sha256=" +
      crypto.createHmac("sha256", appSecret).update(raw).digest("hex");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      console.warn("[whatsapp/webhook] 署名検証失敗");
      return new Response("invalid signature", { status: 401 });
    }
  }

  let payload: WaPayload;
  try {
    payload = JSON.parse(raw) as WaPayload;
  } catch {
    return new Response("bad json", { status: 400 });
  }

  if (payload?.object !== "whatsapp_business_account") {
    return new Response("ignored", { status: 200 });
  }

  let upserts = 0;
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value) continue;
      const nameByWaId = new Map<string, string>();
      for (const c of value.contacts ?? []) {
        if (c.wa_id && c.profile?.name) nameByWaId.set(c.wa_id, c.profile.name);
      }
      for (const m of value.messages ?? []) {
        const waId = m.from;
        if (!waId) continue;
        const text = pickText(m);
        const type = m.type ?? "unknown";
        const seenAt = m.timestamp
          ? new Date(Number(m.timestamp) * 1000)
          : new Date();
        const profileName = nameByWaId.get(waId) ?? null;

        await prisma.whatsappProfile.upsert({
          where: { waId },
          create: {
            waId,
            profileName,
            lastMessageText: text,
            lastWebhookType: type,
            lastSeenAt: seenAt,
          },
          update: {
            profileName: profileName ?? undefined,
            lastMessageText: text ?? undefined,
            lastWebhookType: type,
            lastSeenAt: seenAt,
          },
        });
        upserts++;
      }
      // statuses (送信ステータス更新) は今は無視
    }
  }

  console.log(`[whatsapp/webhook] processed ${upserts} event(s)`);
  return new Response("ok", { status: 200 });
}
