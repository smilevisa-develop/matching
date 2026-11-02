export const runtime = "nodejs";

import crypto from "crypto";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { reconcileMessagePersonLinks } from "@/lib/message-linking";
import { translateForAllStaff } from "@/lib/chat-translate";

export async function GET() {
  return new Response("LINE webhook endpoint is alive", { status: 200 });
}

/** グループ内メンバーの表示名を取得 (失敗時は null) */
async function fetchGroupMemberName(
  groupId: string,
  userId: string,
  token: string
): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.line.me/v2/bot/group/${groupId}/member/${userId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { displayName?: string };
    return data.displayName ?? null;
  } catch {
    return null;
  }
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

  // 署名検証。未設定のまま受け付けると誰でも偽イベントを送れるので、未設定なら受け付けない
  const channelSecret = process.env.LINE_CHANNEL_SECRET;
  if (!channelSecret) {
    console.error("[line/webhook] LINE_CHANNEL_SECRET が未設定です");
    return new Response("misconfigured", { status: 500 });
  }
  const sig = req.headers.get("x-line-signature") ?? "";
  const expected = crypto.createHmac("sha256", channelSecret).update(text).digest("base64");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    console.warn("[line/webhook] 署名検証失敗");
    return new Response("invalid signature", { status: 401 });
  }

  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;

  try {
    const body = JSON.parse(text);
    const events = Array.isArray(body.events) ? body.events : [];
    console.log(`[line/webhook] received ${events.length} event(s)`);

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
            select: { partnerId: true, chatOnly: true },
          });
          // 送信者 (グループメンバー) の userId と表示名を取得
          const senderId = typeof source?.userId === "string" ? source.userId : null;
          const senderName =
            senderId && token ? await fetchGroupMemberName(groupId, senderId, token) : null;
          const saved = await prisma.message.create({
            data: {
              partnerId: linked?.partnerId ?? null,
              channel: "LINE",
              direction: "inbound",
              content: messageText,
              externalId: groupId, // group の場合は groupId を externalId として保存
              senderId,
              senderName,
            },
          });
          // チャット画面に出るグループ (パートナー紐づけ済み / パートナーではない内定後グループなど) だけ、担当者の表示言語に訳しておく
          if (linked?.partnerId || linked?.chatOnly) after(() => translateForAllStaff(saved.id));
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
        const saved = await prisma.message.create({
          data: {
            partnerId: partner?.id ?? null,
            personId: person?.id ?? null,
            channel: "LINE",
            direction: "inbound",
            content: messageText,
            externalId: lineUserId,
          },
        });
        if (saved.partnerId) after(() => translateForAllStaff(saved.id));
      }
    }

    await reconcileMessagePersonLinks();
  } catch (error) {
    // エラー本文には受信内容が混ざることがあるので、種類だけ出す
    const name = error instanceof Error ? error.name : "unknown";
    const code = (error as { code?: unknown } | null)?.code;
    console.error("[line/webhook] 保存に失敗", name, typeof code === "string" ? code : "");
  }

  return new Response("ok", { status: 200 });
}
