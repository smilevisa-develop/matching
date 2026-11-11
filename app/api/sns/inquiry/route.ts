/**
 * SNS から相談を始めた人の記録。POST /api/sns/inquiry  { acc: "id" | "vn", userId: LINE の userId }
 * 相談用の LINE アカウント (CROSLAN JOB MATCH ID / CROSLAN VIỆC LÀM JP) の Webhook を受ける
 * LINE→Slack 転送の Apps Script から、メッセージ・友だち追加のたびに呼ばれる。人ごとに最初の 1 回だけ残す。
 * 未ログインで呼ばれる。数えるだけで本人の情報は持たないので、userId の形だけ確かめる (lib/sns-funnel.ts)
 */
import { prisma } from "@/lib/prisma";
import { isCountry, userKeyOf } from "@/lib/sns-funnel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { acc?: unknown; userId?: unknown } | null;
  const acc = body?.acc;
  const userId = body?.userId;
  if (!isCountry(acc) || typeof userId !== "string" || !/^U[0-9a-f]{32}$/.test(userId)) {
    return Response.json({ ok: false }, { status: 400 });
  }
  const userKey = userKeyOf(userId);
  await prisma.snsInquiry.upsert({
    where: { channel_userKey: { channel: "LINE", userKey } },
    create: { country: acc, channel: "LINE", userKey },
    update: {},
  });
  return Response.json({ ok: true });
}
