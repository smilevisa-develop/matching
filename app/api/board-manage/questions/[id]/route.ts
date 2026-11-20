/**
 * 案件ボードの管理: 質問に答える (要ログイン)。
 * PATCH { answer, isPublic }  isPublic = true なら全パートナーの案件ページに出る。
 * 回答は英語・ベトナム語・インドネシア語にも訳して保存する (lib/board-translate.ts)。
 */

import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";
import { ensureQuestionTranslations } from "@/lib/board-translate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireApiAccount();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const answer = typeof body?.answer === "string" ? body.answer.trim().slice(0, 3000) : "";
    if (!answer) return Response.json({ ok: false, error: "回答を入れてください" }, { status: 400 });
    const current = await prisma.boardQuestion.findUnique({ where: { id: Number(id) }, select: { answeredAt: true } });
    if (!current) return Response.json({ ok: false, error: "質問が見つかりません" }, { status: 404 });
    await prisma.boardQuestion.update({
      where: { id: Number(id) },
      data: { answer, isPublic: body?.isPublic !== false, answeredAt: current.answeredAt ?? new Date() },
    });
    // 回答をパートナーの言語に訳す (応答のあと)
    after(() => ensureQuestionTranslations([Number(id)]));
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 },
    );
  }
}
