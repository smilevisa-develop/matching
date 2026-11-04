import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { parseCsv } from "@/lib/partner-profile";
import { readSurveyAnswers } from "@/lib/partner-survey";
import PartnerSurveyClient from "./PartnerSurveyClient";

export const dynamic = "force-dynamic";

/** パートナーアンケート (認証不要。パートナーごとのリンクで判定)。今の登録内容を入れた状態で出す */
export default async function PartnerSurveyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token || token.length < 8) notFound();
  const partner = await prisma.partner.findUnique({
    where: { surveyToken: token },
    include: { contacts: { where: { isPrimary: true }, take: 1 } },
  });
  if (!partner) notFound();

  return (
    <PartnerSurveyClient
      token={token}
      answeredAt={partner.surveyAnsweredAt?.toISOString() ?? null}
      initial={{
        name: partner.name,
        contactName: partner.contactName ?? partner.contacts[0]?.name ?? "",
        email: partner.email ?? partner.contacts[0]?.email ?? "",
        contactPhone: partner.contactPhone ?? partner.contacts[0]?.phone ?? "",
        introducibleScope: partner.introducibleScope ?? "",
        introducibleNationalities: parseCsv(partner.introducibleNationalities),
        introducibleFields: parseCsv(partner.introducibleFields),
        introducibleResidenceStatuses: parseCsv(partner.introducibleResidenceStatuses),
        feeAmount: partner.feeAmount ?? "",
        minFeeAmount: partner.minFeeAmount ?? "",
        features: partner.features ?? "",
        answers: readSurveyAnswers(partner.surveyAnswers),
      }}
    />
  );
}
