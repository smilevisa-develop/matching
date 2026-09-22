/**
 * 日本語チェックの「テスト開始」(token 認証、未ログイン可)。
 *
 * POST /api/japanese-check/[token]/start
 *
 * 受験は 1 回のみ。開始した時点で記録し、同じリンクを開き直してもやり直せないようにする
 * (問題を見てから答えを準備して受け直す、を防ぐため)。
 * やり直させたいときは管理画面で「再発行」する (開始・送信の記録が消える)。
 */

import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!token || token.length < 8) {
    return Response.json({ ok: false, error: "無効なリンクです" }, { status: 400 });
  }
  // 未開始のときだけ開始を記録する (同時に 2 回押されても 1 回しか通らない)
  const r = await prisma.person.updateMany({
    where: { japaneseCheckToken: token, japaneseCheckStartedAt: null },
    data: { japaneseCheckStartedAt: new Date() },
  });
  if (r.count === 1) return Response.json({ ok: true });

  const person = await prisma.person.findUnique({
    where: { japaneseCheckToken: token },
    select: { japaneseCheckSubmittedAt: true },
  });
  if (!person) {
    return Response.json({ ok: false, error: "リンクが無効です" }, { status: 404 });
  }
  return Response.json(
    {
      ok: false,
      status: person.japaneseCheckSubmittedAt ? "submitted" : "started",
      error: "このテストはすでに受験済みです",
    },
    { status: 409 },
  );
}
