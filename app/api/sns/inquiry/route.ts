/**
 * SNS から相談を始めた人の記録。POST /api/sns/inquiry  { acc: "id" | "vn", channel: "LINE" | "Messenger", userId }
 * 相談用の LINE アカウント (CROSLAN JOB MATCH ID / CROSLAN VIỆC LÀM JP) と、SNS 用の Facebook ページ (Make 経由) のメッセージを受ける
 * LINE→Slack 転送の Apps Script から、メッセージ・友だち追加のたびに呼ばれる。人ごとに最初の 1 回だけ残す。
 * 未ログインで呼ばれる。数えるだけで本人の情報は持たない (ID はハッシュにする) ので、ID の形だけ確かめる (lib/sns-funnel.ts)
 */
import { prisma } from "@/lib/prisma";
import { isCountry, userKeyOf } from "@/lib/sns-funnel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { acc?: unknown; channel?: unknown; userId?: unknown } | null;
  const acc = body?.acc;
  const channel = body?.channel === "Messenger" ? "Messenger" : "LINE";
  const userId = body?.userId;
  // LINE の userId は U + 32 桁、Messenger は数字の ID
  const valid = typeof userId === "string" && (channel === "LINE" ? /^U[0-9a-f]{32}$/ : /^\d{5,25}$/).test(userId);
  if (!isCountry(acc) || !valid) {
    return Response.json({ ok: false }, { status: 400 });
  }
  const userKey = userKeyOf(userId);
  await prisma.snsInquiry.upsert({
    where: { channel_userKey: { channel, userKey } },
    create: { country: acc, channel, userKey },
    update: {},
  });
  return Response.json({ ok: true });
}
