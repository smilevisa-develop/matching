/**
 * パートナーアンケートの回答 (認証不要。パートナーごとのリンクのトークンで判定)。
 *   POST /api/partner-survey/{token}  … 回答を保存する。会社名が登録名と合えばそのままパートナー情報に反映、
 *                                        合わなければ確認待ち (管理者が /partners/survey で反映する)
 */

import { prisma } from "@/lib/prisma";
import { INTRODUCIBLE_FIELDS, INTRODUCIBLE_NATIONALITIES, INTRODUCIBLE_RESIDENCE_STATUSES } from "@/lib/partner-profile";
import { companyNameMatches, readSurveyAnswers, type SurveyResponse } from "@/lib/partner-survey";
import { applySurveyResponse } from "@/lib/partner-survey-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const str = (v: unknown, max = 500): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const pick = (v: unknown, allowed: readonly string[]): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && allowed.includes(x)) : [];

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await ctx.params;
    if (!token || token.length < 8) {
      return Response.json({ ok: false, error: "このリンクは無効です / This link is invalid" }, { status: 404 });
    }
    const partner = await prisma.partner.findUnique({ where: { surveyToken: token }, select: { id: true, name: true } });
    if (!partner) {
      return Response.json({ ok: false, error: "このリンクは無効です / This link is invalid" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const response: SurveyResponse = {
      companyName: str(body.companyName, 200),
      contactName: str(body.contactName, 200),
      answers: readSurveyAnswers(body.answers),
      // 選択肢に無い国籍は「その他」の自由入力 (読点・カンマ区切り、1 つ 30 文字まで、5 つまで)
      introducibleNationalities: [
        ...pick(body.introducibleNationalities, INTRODUCIBLE_NATIONALITIES),
        ...str(body.otherNationality, 200)
          .split(/[、,，/／]/)
          .map((x) => x.trim().slice(0, 30))
          .filter((x) => x && !(INTRODUCIBLE_NATIONALITIES as readonly string[]).includes(x))
          .slice(0, 5),
      ],
      introducibleFields: pick(body.introducibleFields, INTRODUCIBLE_FIELDS),
      introducibleResidenceStatuses: pick(body.introducibleResidenceStatuses, INTRODUCIBLE_RESIDENCE_STATUSES),
      feeAmount: str(body.feeAmount, 200),
      minFeeAmount: str(body.minFeeAmount, 200),
      features: str(body.features, 2000),
    };
    if (!response.companyName) {
      return Response.json({ ok: false, error: "会社名を入力してください / Company name is required" }, { status: 400 });
    }

    await prisma.partner.update({ where: { id: partner.id }, data: { surveyAnsweredAt: new Date(), surveyResponse: response } });
    // 会社名が登録名と合うときだけ、そのまま反映する (LINE が別の会社に紐づいていたときの上書きを防ぐ)
    if (companyNameMatches(response.companyName, partner.name)) await applySurveyResponse(partner.id, response);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "error" }, { status: 500 });
  }
}
