/**
 * 日本語チェック専用リンクの受け口 (token 認証、未ログイン可)。
 *
 * POST /api/japanese-check/[token]
 *   body: { recordings: [{ key, dataUrl, seconds }] }   dataUrl は "data:audio/...;base64,..."
 *
 * 入力フォーム (intake) とは独立したトークンで動く。
 * 音声は個人情報なので、フォーム側で同意を得た上で送る前提。
 */

import { prisma } from "@/lib/prisma";
import { submitJapaneseCheck } from "@/lib/japanese-check-submit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await ctx.params;
    if (!token || token.length < 8) {
      return Response.json({ ok: false, error: "無効なリンクです" }, { status: 400 });
    }

    const person = await prisma.person.findUnique({
      where: { japaneseCheckToken: token },
      select: { id: true },
    });
    if (!person) {
      return Response.json({ ok: false, error: "リンクが無効です" }, { status: 404 });
    }

    const body = await req.json();
    const result = await submitJapaneseCheck(person.id, body?.recordings);
    if (!result.ok) {
      return Response.json({ ok: false, error: result.error }, { status: result.status });
    }
    return Response.json(result);
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: 500 },
    );
  }
}
