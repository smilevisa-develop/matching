export const runtime = "nodejs";

import { prisma } from "@/lib/prisma";
import { reconcileMessagePersonLinks } from "@/lib/message-linking";

export async function GET() {
  return new Response("LINE webhook endpoint is alive", { status: 200 });
}

export async function POST(req: Request) {
  const text = await req.text();
  console.log("=== LINE WEBHOOK RECEIVED ===", text);

  try {
    const body = JSON.parse(text);
    const events = Array.isArray(body.events) ? body.events : [];

    for (const event of events) {
      const source = event?.source;
      const lineUserId =
        source?.type === "user" && typeof source.userId === "string"
          ? source.userId
          : null;
      if (!lineUserId) continue;

      const messageText =
        event?.message?.type === "text" && typeof event.message.text === "string"
          ? event.message.text
          : null;

      // LineProfile を upsert
      await prisma.lineProfile.upsert({
        where: { lineUserId },
        update: {
          lastMessageText: messageText,
          lastWebhookType: typeof event?.type === "string" ? event.type : null,
          lastSeenAt: new Date(),
        },
        create: {
          lineUserId,
          lastMessageText: messageText,
          lastWebhookType: typeof event?.type === "string" ? event.type : null,
          lastSeenAt: new Date(),
        },
      });

      // メッセージを Message テーブルに保存 (Partner 優先 → Person フォールバック)
      if (messageText) {
        const partner = await prisma.partner.findFirst({ where: { lineUserId } });
        const person = partner ? null : await prisma.person.findFirst({ where: { lineUserId } });
        await prisma.message.create({
          data: {
            partnerId: partner?.id ?? null,
            personId: person?.id ?? null,
            channel: "LINE",
            direction: "inbound",
            content: messageText,
            externalId: lineUserId,
          },
        });
      }
    }

    await reconcileMessagePersonLinks();
  } catch (error) {
    console.error("Failed to store LINE webhook payload", error);
  }

  return new Response("ok", { status: 200 });
}
