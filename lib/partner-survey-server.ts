import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { publicUrl } from "@/lib/public-url";
import { toCsv } from "@/lib/partner-profile";
import { CANDIDATE_LOCATION_TO_SCOPE, type SurveyResponse } from "@/lib/partner-survey";

/** パートナーごとのアンケートのリンク。トークンが無ければ作って保存する */
export async function ensureSurveyUrl(partnerId: number): Promise<string> {
  const current = await prisma.partner.findUnique({ where: { id: partnerId }, select: { surveyToken: true } });
  let token = current?.surveyToken ?? null;
  if (!token) {
    token = randomBytes(18).toString("base64url");
    await prisma.partner.update({ where: { id: partnerId }, data: { surveyToken: token } });
  }
  return publicUrl(`/partner-survey/${token}`);
}

/**
 * 回答をパートナー情報に反映する。空で来た項目は消さない (前の値を残す)。
 * 会社名は相手が確認用に入れたものなので、登録名は変えない
 */
export async function applySurveyResponse(partnerId: number, r: SurveyResponse): Promise<void> {
  const data: Record<string, unknown> = { surveyAnswers: r.answers, surveyAppliedAt: new Date() };
  if (r.contactName) data.contactName = r.contactName;
  if (r.feeAmount) data.feeAmount = r.feeAmount;
  if (r.minFeeAmount) data.minFeeAmount = r.minFeeAmount;
  if (r.features) data.features = r.features;
  const scope = CANDIDATE_LOCATION_TO_SCOPE[r.answers.candidateLocation?.[0] ?? ""];
  if (scope) data.introducibleScope = scope;
  const nationalities = toCsv(r.introducibleNationalities);
  const fields = toCsv(r.introducibleFields);
  const statuses = toCsv(r.introducibleResidenceStatuses);
  if (nationalities) data.introducibleNationalities = nationalities;
  if (fields) data.introducibleFields = fields;
  if (statuses) data.introducibleResidenceStatuses = statuses;
  await prisma.partner.update({ where: { id: partnerId }, data });
}
