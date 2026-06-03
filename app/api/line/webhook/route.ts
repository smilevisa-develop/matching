export const runtime = "nodejs";

import { prisma } from "@/lib/prisma";
import { reconcileMessagePersonLinks } from "@/lib/message-linking";

export async function GET() {
  return new Response("LINE webhook endpoint is alive", { status: 200 });
}

/** LINE Messaging API でグループサマリーを取得 */
async function fetchGroupSummary(
  groupId: string,
  token: string
): Promise<{ groupName: string | null; memberCount: number | null }> {
  try {
    const [summaryRes, countRes] = await Promise.all([
      fetch(`https://api.line.me/v2/bot/group/${groupId}/summary`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      fetch(`https://api.line.me/v2/bot/group/${groupId}/members/count`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    ]);
    const groupName = summaryRes.ok
      ? ((await summaryRes.json()) as { groupName?: string }).groupName ?? null
      : null;
    const memberCount = countRes.ok
      ? ((await countRes.json()) as { count?: number }).count ?? null
      : null;
    return { groupName, memberCount };
  } catch {
    return { groupName: null, memberCount: null };
  }
}

export async function POST(req: Request) {
  const text = await req.text();
  console.log("=== LINE WEBHOOK RECEIVED ===", text);

  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;

  try {
    const body = JSON.parse(text);
    const events = Array.isArray(body.events) ? body.events : [];

    for (const event of events) {
      const source = event?.source;
      const sourceType = source?.type as string | undefined;
      const eventType = typeof event?.type === "string" ? event.type : null;
      const messageText =
        event?.message?.type === "text" && typeof event.message.text === "string"
          ? event.message.text
          : null;
      const now = new Date();

      // ── グループ / 複数人チャットイベント ──
      if (sourceType === "group" || sourceType === "room") {
        const groupId = (source?.groupId ?? source?.roomId) as string | undefined;
        if (!groupId) continue;

        // 初回 (join) や未登録時はグループサマリーを取得
        const existing = await prisma.lineGroup.findUnique({ where: { groupId } });
        let groupName = existing?.groupName ?? null;
        let memberCount = existing?.memberCount ?? null;
        if (token && (!existing || eventType === "join")) {
          const summary = await fetchGroupSummary(groupId, token);
          groupName = summary.groupName ?? groupName;
          memberCount = summary.memberCount ?? memberCount;
        }

        await prisma.lineGroup.upsert({
          where: { groupId },
          create: {
            groupId,
            sourceType: sourceType,
            groupName,
            memberCount,
            lastMessageText: messageText,
            lastWebhookType: eventType,
            lastSeenAt: now,
            isActive: eventType !== "leave",
          },
          update: {
            sourceType: sourceType,
            groupName: groupName ?? undefined,
            memberCount: memberCount ?? undefined,
            lastMessageText: messageText ?? undefined,
            lastWebhookType: eventType,
            lastSeenAt: now,
            isActive: eventType !== "leave",
          },
        });

        // グループから受信したメッセージは Message テーブルに記録 (partner 紐づけ済みならその partnerId 付き)
        if (messageText) {
          const linked = await prisma.lineGroup.findUnique({
            where: { groupId },
            select: { partnerId: true },
          });
          await prisma.message.create({
            data: {
              partnerId: linked?.partnerId ?? null,
              channel: "LINE",
              direction: "inbound",
              content: messageText,
              externalId: groupId, // group の場合は groupId を externalId として保存
            },
          });
        }
        continue;
      }

      // ── 個人 (1:1) イベント ──
      const lineUserId =
        sourceType === "user" && typeof source.userId === "string"
          ? source.userId
          : null;
      if (!lineUserId) continue;

      // LineProfile を upsert
      await prisma.lineProfile.upsert({
        where: { lineUserId },
        update: {
          lastMessageText: messageText,
          lastWebhookType: eventType,
          lastSeenAt: now,
        },
        create: {
          lineUserId,
          lastMessageText: messageText,
          lastWebhookType: eventType,
          lastSeenAt: now,
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
