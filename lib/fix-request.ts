/**
 * Slack の修正依頼を自動で直す (2026-11-18 土田さん)。
 *   1. 依頼の投稿の「…」メニュー →「自動で修正」(Slack アプリのメッセージショートカット, callback_id = auto_fix)
 *   2. ここで FixRequest に積んで、スレッドに「受け付けました」
 *   3. 土田さんの Mac (tools/fix-runner) が 1 分ごとに取り出し、Claude Code で直して本番に出し、スレッドに返信
 * 使えるのは FIX_ALLOWED_USERS の人だけ。ほかの人には本人の ID を出して断る (記録は status=rejected)。
 */

import { prisma } from "@/lib/prisma";
import { slackApi, slackPost } from "@/lib/slack";

/** 土田さんの Slack ID (CROSLAN-人材紹介)。環境変数 SLACK_FIX_USERS (カンマ区切り) で足せる */
const FIX_ALLOWED_USERS: string[] = [];

export function fixAllowed(userId: string) {
  const extra = (process.env.SLACK_FIX_USERS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return [...FIX_ALLOWED_USERS, ...extra].includes(userId);
}

export async function handleFixShortcut(p: { channel: string; messageTs: string; threadTs: string; userId: string; responseUrl?: string }) {
  if (!fixAllowed(p.userId)) {
    await prisma.fixRequest.create({ data: { channel: p.channel, messageTs: p.messageTs, threadTs: p.threadTs, requestedBy: p.userId, status: "rejected" } });
    if (p.responseUrl) {
      await fetch(p.responseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response_type: "ephemeral", text: `このメニューは使えません (あなたの ID: ${p.userId})` }),
      }).catch(() => {});
    }
    return;
  }
  const waiting = await prisma.fixRequest.count({ where: { status: { in: ["queued", "running"] } } });
  await prisma.fixRequest.create({ data: { channel: p.channel, messageTs: p.messageTs, threadTs: p.threadTs, requestedBy: p.userId } });
  const r = await slackPost(
    p.channel,
    waiting ? `🔧 受け付けました (前に ${waiting} 件あります)。直したら、このスレッドでお知らせします。` : "🔧 受け付けました。直したら、このスレッドでお知らせします。",
    p.threadTs,
  );
  if (!r.ok && r.error === "not_in_channel") {
    await slackApi("conversations.join", { channel: p.channel });
    await slackPost(p.channel, "🔧 受け付けました。直したら、このスレッドでお知らせします。", p.threadTs);
  }
}
