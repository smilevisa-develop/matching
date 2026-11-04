import { prisma } from "@/lib/prisma";
import { requireCurrentAccount } from "@/lib/auth";
import { parseCsv } from "@/lib/partner-profile";
import { readSurveyAnswers } from "@/lib/partner-survey";
import PartnerSurveyAdminClient, { type SurveyRow } from "./PartnerSurveyAdminClient";

export const dynamic = "force-dynamic";

/** パートナーアンケート: 文面の確認・送信・回答状況を 1 か所で見る */
export default async function PartnerSurveyAdminPage() {
  const account = await requireCurrentAccount();
  const partners = await prisma.partner.findMany({
    where: { isActive: true },
    orderBy: { id: "desc" },
    select: {
      id: true,
      name: true,
      country: true,
      channel: true,
      preferredChannels: true,
      surveySentAt: true,
      surveyAnsweredAt: true,
      surveyAnswers: true,
      introducibleScope: true,
      introducibleFields: true,
      introducibleNationalities: true,
    },
  });
  const rows: SurveyRow[] = partners.map((p) => {
    const channels = parseCsv(p.preferredChannels).filter((c) => c !== "未設定");
    return {
      id: p.id,
      name: p.name,
      country: p.country,
      channels: channels.length > 0 ? channels : p.channel && p.channel !== "未設定" ? [p.channel] : [],
      sentAt: p.surveySentAt?.toISOString() ?? null,
      answeredAt: p.surveyAnsweredAt?.toISOString() ?? null,
      answers: readSurveyAnswers(p.surveyAnswers),
      scope: p.introducibleScope,
      fields: parseCsv(p.introducibleFields),
      nationalities: parseCsv(p.introducibleNationalities),
    };
  });
  // 一斉連絡と同じく、文面の「株式会社CROSLANの◯◯です」には送る人の姓を入れる
  const senderLastName = account.name.trim().split(/\s+/)[0] ?? "";
  return <PartnerSurveyAdminClient rows={rows} senderLastName={senderLastName} />;
}
