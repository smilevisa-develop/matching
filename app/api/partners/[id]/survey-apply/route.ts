/**
 * 確認待ちのアンケート回答をパートナー情報に反映する (要ログイン)。
 *   POST /api/partners/{id}/survey-apply → { ok }
 * 会社名が登録名と合わず自動で反映されなかった回答を、管理者が中身を見て反映するときに使う
 */

import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAdmin } from "@/lib/auth";
import { readSurveyResponse } from "@/lib/partner-survey";
import { applySurveyResponse } from "@/lib/partner-survey-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireApiAdmin();
    const { id } = await params;
    const partnerId = Number(id);
    if (!Number.isFinite(partnerId)) return Response.json({ ok: false, error: "id が不正です" }, { status: 400 });
    const body = await req.json().catch(() => ({}));
    const logId = Number(body?.logId);
    // 履歴の 1 件を指定して反映する (同じ会社が何回か答えたとき、どの回答を使うか選べる)
    if (Number.isInteger(logId) && logId > 0) {
      const log = await prisma.partnerSurveyResponseLog.findFirst({ where: { id: logId, partnerId }, select: { response: true } });
      const response = readSurveyResponse(log?.response);
      if (!response) return Response.json({ ok: false, error: "回答がありません" }, { status: 404 });
      await applySurveyResponse(partnerId, response);
      await prisma.partner.update({ where: { id: partnerId }, data: { surveyResponse: response } });
      // 選んだ回答と、それより前の未反映は「確認済み」にする (後から古い回答が要確認に戻らないように)。それより新しい未反映は残す
      const chosen = await prisma.partnerSurveyResponseLog.findUniqueOrThrow({ where: { id: logId }, select: { createdAt: true } });
      await prisma.partnerSurveyResponseLog.updateMany({
        where: { partnerId, applied: false, createdAt: { lte: chosen.createdAt } },
        data: { applied: true },
      });
      return Response.json({ ok: true });
    }
    const partner = await prisma.partner.findUnique({ where: { id: partnerId }, select: { surveyResponse: true } });
    const response = readSurveyResponse(partner?.surveyResponse);
    if (!response) return Response.json({ ok: false, error: "回答がありません" }, { status: 404 });
    await applySurveyResponse(partnerId, response);
    await prisma.partnerSurveyResponseLog.updateMany({
      where: { partnerId, applied: false },
      data: { applied: true },
      // 最新を反映したので、それより前の未反映も「確認済み」扱いにする
    });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 },
    );
  }
}
