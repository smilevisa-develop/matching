/**
 * 日本語チェック専用リンクの受け口 (token 認証、未ログイン可)。
 *
 * POST /api/japanese-check/[token]
 *   body: { recordings: [{ key, dataUrl, seconds }] }   dataUrl は "data:audio/...;base64,..."
 *
 * 入力フォーム (intake) とは独立したトークンで動く。
 * 受験は 1 回のみ: POST ./start で開始済み かつ 未送信 のときだけ受け付ける。
 * 音声は個人情報なので、フォーム側で同意を得た上で送る前提。
 */

import { prisma } from "@/lib/prisma";
import { after } from "next/server";
import {
  judgeStoredJapaneseCheck,
  storeJapaneseCheckRecordings,
} from "@/lib/japanese-check-submit";

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
      select: { id: true, japaneseCheckStartedAt: true, japaneseCheckSubmittedAt: true },
    });
    if (!person) {
      return Response.json({ ok: false, error: "リンクが無効です" }, { status: 404 });
    }
    // 受験は 1 回のみ: 「テスト開始」を押していない / 送信済み のリンクでは受け付けない
    if (person.japaneseCheckSubmittedAt) {
      return Response.json(
        { ok: false, error: "このテストはすでに送信済みです" },
        { status: 409 },
      );
    }
    if (!person.japaneseCheckStartedAt) {
      return Response.json(
        { ok: false, error: "テストが開始されていません" },
        { status: 409 },
      );
    }

    const body = await req.json();

    // 保存までは応答前に完了させる (届いていないのに「送信完了」と出す事故を防ぐ)
    const stored = await storeJapaneseCheckRecordings(person.id, body?.recordings);
    if (!stored.ok) {
      return Response.json({ ok: false, error: stored.error }, { status: stored.status });
    }

    // 送信済みを記録 (同じリンクで二度目は受け付けない)。
    // 保存に成功した後に付けるので、通信失敗なら候補者は同じ画面から送り直せる
    await prisma.person.update({
      where: { id: person.id },
      data: { japaneseCheckSubmittedAt: new Date() },
    });

    // AI 判定は 20〜60 秒かかるうえ、結果が要るのは採用担当であって候補者ではない。
    // 応答を返したあとに走らせ、候補者を待たせない。
    after(async () => {
      await judgeStoredJapaneseCheck(person.id, stored.forJudge);
    });

    return Response.json({ ok: true, saved: stored.count });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: 500 },
    );
  }
}
