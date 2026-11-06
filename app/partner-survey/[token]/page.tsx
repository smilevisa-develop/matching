import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { parseCsv } from "@/lib/partner-profile";
import { readSurveyAnswers } from "@/lib/partner-survey";
import PartnerSurveyClient, { type SurveyInitial } from "./PartnerSurveyClient";

const PREVIEW_INITIAL: SurveyInitial = {
  introducibleNationalities: [],
  introducibleFields: [],
  introducibleResidenceStatuses: [],
  feeAmount: "",
  minFeeAmount: "",
  features: "",
  answers: {},
};

export const dynamic = "force-dynamic";

/** LINE などのリンクプレビュー用。企業に送るので、社内向けアプリのアイコンではなくアンケート専用の画像と題名を出す */
export const metadata: Metadata = {
  // og:image は絶対 URL でないと LINE が読まない
  metadataBase: new URL("https://matching.smilereach.jp"),
  title: "パートナーアンケート | 株式会社CROSLAN",
  description: "ご紹介いただける人材について教えてください（約3分）/ Please tell us about the candidates you can introduce (about 3 min)",
  icons: { icon: "/partner-survey-icon.png", shortcut: "/partner-survey-icon.png", apple: "/partner-survey-icon.png" },
  openGraph: {
    title: "パートナーアンケート | 株式会社CROSLAN",
    description: "ご紹介いただける人材について教えてください（約3分）",
    siteName: "株式会社CROSLAN",
    type: "website",
    images: [{ url: "/partner-survey-og.png", width: 1200, height: 630 }],
  },
  twitter: { card: "summary_large_image" },
};

/**
 * パートナーアンケート (認証不要。パートナーごとのリンクで判定)。
 * 会社名と担当者名は相手に入れてもらう (LINE が正しい会社に紐づいているかの確認に使う)。選択式は今の登録内容を入れておく
 */
export default async function PartnerSurveyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // 社内確認用のプレビュー (送信はできない)
  if (token === "preview") return <PartnerSurveyClient token="preview" preview answeredAt={null} initial={PREVIEW_INITIAL} />;
  if (!token || token.length < 8) notFound();
  const partner = await prisma.partner.findUnique({ where: { surveyToken: token } });
  if (!partner) notFound();

  return (
    <PartnerSurveyClient
      token={token}
      answeredAt={partner.surveyAnsweredAt?.toISOString() ?? null}
      initial={{
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
