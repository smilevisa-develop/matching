import { notFound } from "next/navigation";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  BOARD_REC_INACTIVE,
  conditionsFromPosting,
  getBoardLang,
  getBoardViewer,
  isPastDeadline,
  requirementsOf,
  totalLimitOf,
  ymd,
} from "@/lib/board";
import { dealSourceTexts, ensureDealTranslations, ensureQuestionTranslations, pickQa, pickTexts } from "@/lib/board-translate";
import BoardHeader, { BoardSignedOut } from "../_components/BoardHeader";
import DealBoardClient from "./DealBoardClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "案件 / Job | SMILE MATCHING",
  robots: { index: false, follow: false },
};

/** パートナー向けの案件ページ (会社名・住所は出さない) */
export default async function BoardDealPage({ params }: { params: Promise<{ dealId: string }> }) {
  const partner = await getBoardViewer();
  const lang = await getBoardLang(partner);
  if (!partner) return <BoardSignedOut lang={lang} />;

  const { dealId } = await params;
  const id = Number(dealId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const deal = await prisma.deal.findUnique({
    where: { id },
    select: {
      id: true,
      field: true,
      requiredCount: true,
      deadline: true,
      updatedAt: true,
      boardStatus: true,
      boardTitle: true,
      boardArea: true,
      boardSummary: true,
      boardPartnerFee: true,
      boardRequirements: true,
      boardJobChangeScope: true,
      boardPlaceChangeScope: true,
      boardRenewalLimit: true,
      boardPerPartnerLimit: true,
      boardTotalLimit: true,
      boardPublishedAt: true,
      boardTranslations: true,
      jobPostings: { orderBy: { updatedAt: "desc" }, take: 1 },
      boardRecommendations: {
        select: { id: true, partnerId: true, status: true, statusNote: true, candidateName: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      },
      boardQuestions: {
        where: { OR: [{ isPublic: true, answer: { not: null } }, { partnerId: partner.id }] },
        orderBy: { createdAt: "desc" },
        select: { id: true, partnerId: true, question: true, answer: true, answeredAt: true, isPublic: true, createdAt: true, translations: true },
      },
    },
  });
  if (!deal || deal.boardStatus === "hidden") notFound();

  const active = deal.boardRecommendations.filter((r) => !BOARD_REC_INACTIVE.includes(r.status));
  const myActive = active.filter((r) => r.partnerId === partner.id).length;
  const totalLimit = totalLimitOf(deal);
  const closed = deal.boardStatus === "closed" || isPastDeadline(deal.deadline);
  const full = active.length >= totalLimit;
  const posting = (deal.jobPostings[0] ?? null) as unknown as Record<string, unknown> | null;

  // 選んだ言語の訳。無い・古い項目は日本語のまま出し、応答のあとに訳しておく
  const ja = dealSourceTexts(deal, posting);
  const { texts: tr, missing } = pickTexts(deal.boardTranslations, ja, lang);
  const qa = deal.boardQuestions.map((q) => ({ q, picked: pickQa(q.translations, q.question, q.answer, lang) }));
  const qaMissing = qa.filter((x) => x.picked.missing).map((x) => x.q.id);
  if (missing) after(() => ensureDealTranslations(deal.id));
  if (qaMissing.length) after(() => ensureQuestionTranslations(qaMissing));
  const requirements = requirementsOf(deal.boardRequirements);
  const conditions = conditionsFromPosting(posting);

  return (
    <div className="min-h-screen bg-[var(--color-light)]">
      <BoardHeader lang={lang} partnerName={partner.name} />
      <DealBoardClient
        lang={lang}
        translating={lang !== "ja" && (missing || qaMissing.length > 0)}
        preview={partner.preview}
        deal={{
          id: deal.id,
          title: tr.title ?? `#${deal.id}`,
          field: tr.field ?? "",
          area: tr.area ?? "",
          summary: tr.summary ?? "",
          fee: tr.fee ?? "",
          openings: deal.requiredCount,
          deadline: ymd(deal.deadline),
          publishedAt: ymd(deal.boardPublishedAt),
          updatedAt: ymd(deal.updatedAt),
          jobChangeScope: tr.jobChange ?? "",
          placeChangeScope: tr.placeChange ?? "",
          renewalLimit: tr.renewal ?? "",
          requirements: requirements.map((r, i) => ({ ja: r, text: tr[`req.${i}`] ?? r })),
          conditions: conditions.map((c) => ({ ...c, text: tr[`c.${c.key}`] ?? c.value })),
          original: {
            title: ja.title ?? "",
            field: ja.field ?? "",
            area: ja.area ?? "",
            summary: ja.summary ?? "",
            fee: ja.fee ?? "",
            jobChangeScope: ja.jobChange ?? "",
            placeChangeScope: ja.placeChange ?? "",
            renewalLimit: ja.renewal ?? "",
          },
          myCount: myActive,
          myLimit: deal.boardPerPartnerLimit,
          totalCount: active.length,
          totalLimit,
          closed,
          full,
        }}
        myRecs={deal.boardRecommendations
          .filter((r) => r.partnerId === partner.id)
          .map((r) => ({
            id: r.id,
            candidateName: r.candidateName,
            status: r.status,
            statusNote: r.statusNote ?? "",
            createdAt: ymd(r.createdAt),
          }))}
        questions={qa.map(({ q, picked }) => ({
          id: q.id,
          question: picked.question,
          answer: picked.answer,
          originalQuestion: q.question,
          originalAnswer: q.answer ?? "",
          translated: picked.translated,
          answeredAt: ymd(q.answeredAt),
          mine: q.partnerId === partner.id,
          isPublic: q.isPublic,
        }))}
      />
    </div>
  );
}
