import { prisma } from "@/lib/prisma";
import { requireCurrentAccount } from "@/lib/auth";
import { parseCsv } from "@/lib/partner-profile";
import { companyNameMatches, readSurveyAnswers, readSurveyResponse } from "@/lib/partner-survey";
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
      surveyResponse: true,
      surveyAppliedAt: true,
      introducibleScope: true,
      introducibleFields: true,
      introducibleNationalities: true,
      // 一斉連絡の送り先と同じ判定: 紐づいた LINE グループ、主担当のメール
      lineGroups: { where: { isActive: true, chatOnly: false }, select: { id: true, groupName: true }, take: 3 },
      // まだ反映していない回答 (会社名が合わず止めたもの)。同じ会社が何回か答えていれば全部出す
      surveyResponses: { where: { applied: false }, orderBy: { createdAt: "desc" }, select: { id: true, companyName: true, createdAt: true } },
      contacts: { where: { isPrimary: true }, select: { email: true }, take: 1 },
    },
  });
  const rows: SurveyRow[] = partners.map((p) => {
    const names = parseCsv(p.preferredChannels).filter((c) => c !== "未設定");
    const chosen = names.length > 0 ? names : p.channel && p.channel !== "未設定" ? [p.channel] : [];
    const email = p.email ?? p.contacts[0]?.email ?? null;
    // 連絡手段ごとに、送り先が実際に紐づいているか (一斉連絡で届くか)
    // 送り先の名前も出す (送る前に、正しい LINE グループに紐づいているか目で確かめるため)
    const lineTo = p.lineGroups.length > 0 ? p.lineGroups.map((g) => g.groupName || "(名前なしのグループ)").join(" / ") : p.lineUserId ? "個人 LINE" : null;
    const channels: SurveyChannel[] = chosen.map((name) => {
      if (name === "LINE") return { name, linked: !!lineTo, deliverable: !!lineTo, to: lineTo };
      if (name === "Messenger") return { name, linked: !!p.messengerPsid, deliverable: !!p.messengerPsid, to: p.messengerPsid ? "Messenger" : null };
      // WhatsApp はお知らせの承認テンプレートが無いので、紐づいていても届かない
      if (name === "WhatsApp") return { name, linked: !!p.whatsappId, deliverable: false, to: null };
      if (name === "mail" || name === "メール" || name === "Email") {
        const ok = !!email && /@/.test(email);
        return { name: "mail", linked: ok, deliverable: ok, to: ok ? email : null };
      }
      return { name, linked: false, deliverable: false, to: null };
    });
    const response = readSurveyResponse(p.surveyResponse);
    // 回答そのものが無い (この仕組みより前の回答) はそのまま反映されていたので反映済み扱い
    const applied = !response || (!!p.surveyAppliedAt && !!p.surveyAnsweredAt && p.surveyAppliedAt >= p.surveyAnsweredAt);
    return {
      id: p.id,
      name: p.name,
      country: p.country,
      channels,
      reachable: channels.some((c) => c.deliverable),
      sentAt: p.surveySentAt?.toISOString() ?? null,
      answeredAt: p.surveyAnsweredAt?.toISOString() ?? null,
      answers: applied ? readSurveyAnswers(p.surveyAnswers) : (response?.answers ?? {}),
      typedName: response?.companyName ?? null,
      nameMatches: response ? companyNameMatches(response.companyName, p.name) : null,
      applied,
      pending: applied
        ? []
        : p.surveyResponses.map((l) => ({
            logId: l.id,
            typedName: l.companyName,
            answeredAt: l.createdAt.toISOString(),
            nameMatches: companyNameMatches(l.companyName, p.name),
          })),
      scope: p.introducibleScope,
      fields: parseCsv(p.introducibleFields),
      nationalities: parseCsv(p.introducibleNationalities),
    };
  });
  // 一斉連絡と同じく、文面の「株式会社CROSLANの◯◯です」には送る人の姓を入れる
  const senderLastName = account.name.trim().split(/\s+/)[0] ?? "";
  return <PartnerSurveyAdminClient rows={rows} senderLastName={senderLastName} />;
}
