/**
 * 確認待ちのアンケート回答をパートナー情報に反映する (要ログイン)。
 *   POST /api/partners/{id}/survey-apply → { ok }
 * 会社名が登録名と合わず自動で反映されなかった回答を、管理者が中身を見て反映するときに使う
 */

import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";
import { readSurveyResponse } from "@/lib/partner-survey";
import { applySurveyResponse } from "@/lib/partner-survey-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireApiAccount();
    const { id } = await params;
    const partnerId = Number(id);
    if (!Number.isFinite(partnerId)) return Response.json({ ok: false, error: "id が不正です" }, { status: 400 });
    const partner = await prisma.partner.findUnique({ where: { id: partnerId }, select: { surveyResponse: true } });
    const response = readSurveyResponse(partner?.surveyResponse);
    if (!response) return Response.json({ ok: false, error: "回答がありません" }, { status: 404 });
    await applySurveyResponse(partnerId, response);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 },
    );
  }
}
