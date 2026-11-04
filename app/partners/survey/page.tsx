import { prisma } from "@/lib/prisma";
import { requireCurrentAccount } from "@/lib/auth";
import { parseCsv } from "@/lib/partner-profile";
import { readSurveyAnswers } from "@/lib/partner-survey";
import PartnerSurveyAdminClient, { type SurveyChannel, type SurveyRow } from "./PartnerSurveyAdminClient";

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
      email: true,
      lineUserId: true,
      messengerPsid: true,
      whatsappId: true,
      surveySentAt: true,
      surveyAnsweredAt: true,
      surveyAnswers: true,
      introducibleScope: true,
      introducibleFields: true,
      introducibleNationalities: true,
      // 一斉連絡の送り先と同じ判定: 紐づいた LINE グループ、主担当のメール
      lineGroups: { where: { isActive: true, chatOnly: false }, select: { id: true }, take: 1 },
      contacts: { where: { isPrimary: true }, select: { email: true }, take: 1 },
    },
  });
  const rows: SurveyRow[] = partners.map((p) => {
    const names = parseCsv(p.preferredChannels).filter((c) => c !== "未設定");
    const chosen = names.length > 0 ? names : p.channel && p.channel !== "未設定" ? [p.channel] : [];
    const email = p.email ?? p.contacts[0]?.email ?? null;
    // 連絡手段ごとに、送り先が実際に紐づいているか (一斉連絡で届くか)
    const channels: SurveyChannel[] = chosen.map((name) => {
      if (name === "LINE") return { name, linked: p.lineGroups.length > 0 || !!p.lineUserId, deliverable: p.lineGroups.length > 0 || !!p.lineUserId };
      if (name === "Messenger") return { name, linked: !!p.messengerPsid, deliverable: !!p.messengerPsid };
      // WhatsApp はお知らせの承認テンプレートが無いので、紐づいていても届かない
      if (name === "WhatsApp") return { name, linked: !!p.whatsappId, deliverable: false };
      if (name === "mail" || name === "メール" || name === "Email") return { name: "mail", linked: !!email && /@/.test(email), deliverable: !!email && /@/.test(email) };
      return { name, linked: false, deliverable: false };
    });
    return {
      id: p.id,
      name: p.name,
      country: p.country,
      channels,
      reachable: channels.some((c) => c.deliverable),
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
