import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { publicUrl } from "@/lib/public-url";

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
