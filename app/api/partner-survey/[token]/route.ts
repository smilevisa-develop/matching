/**
 * パートナーアンケートの回答 (認証不要。パートナーごとのリンクのトークンで判定)。
 *   POST /api/partner-survey/{token}  … 回答をそのままパートナー情報に入れる
 *
 * 空で送られた項目は消さない (前の値を残す)。選択式は選んだものだけを保存する。
 */

import { prisma } from "@/lib/prisma";
import {
  INTRODUCIBLE_FIELDS,
  INTRODUCIBLE_NATIONALITIES,
  INTRODUCIBLE_RESIDENCE_STATUSES,
  INTRODUCIBLE_SCOPES,
  toCsv,
} from "@/lib/partner-profile";
import { readSurveyAnswers } from "@/lib/partner-survey";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const str = (v: unknown, max = 500): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, max);
  return t === "" ? null : t;
};
const pick = (v: unknown, allowed: readonly string[]): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && allowed.includes(x)) : [];

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await ctx.params;
    if (!token || token.length < 8) {
      return Response.json({ ok: false, error: "このリンクは無効です / This link is invalid" }, { status: 404 });
    }
    const partner = await prisma.partner.findUnique({ where: { surveyToken: token }, select: { id: true } });
    if (!partner) {
      return Response.json({ ok: false, error: "このリンクは無効です / This link is invalid" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const data: Record<string, unknown> = {
      surveyAnsweredAt: new Date(),
      surveyAnswers: readSurveyAnswers(body.answers),
    };
    const contactName = str(body.contactName, 200);
    const email = str(body.email, 200);
    const contactPhone = str(body.contactPhone, 100);
    const feeAmount = str(body.feeAmount, 200);
    const minFeeAmount = str(body.minFeeAmount, 200);
    const features = str(body.features, 2000);
    if (contactName) data.contactName = contactName;
    if (email) data.email = email;
    if (contactPhone) data.contactPhone = contactPhone;
    if (feeAmount) data.feeAmount = feeAmount;
    if (minFeeAmount) data.minFeeAmount = minFeeAmount;
    if (features) data.features = features;
    const scope = str(body.introducibleScope, 20);
    if (scope && (INTRODUCIBLE_SCOPES as readonly string[]).includes(scope)) data.introducibleScope = scope;
    const nationalities = toCsv(pick(body.introducibleNationalities, INTRODUCIBLE_NATIONALITIES));
    const fields = toCsv(pick(body.introducibleFields, INTRODUCIBLE_FIELDS));
    const statuses = toCsv(pick(body.introducibleResidenceStatuses, INTRODUCIBLE_RESIDENCE_STATUSES));
    if (nationalities) data.introducibleNationalities = nationalities;
    if (fields) data.introducibleFields = fields;
    if (statuses) data.introducibleResidenceStatuses = statuses;

    await prisma.partner.update({ where: { id: partner.id }, data });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "error" }, { status: 500 });
  }
}
