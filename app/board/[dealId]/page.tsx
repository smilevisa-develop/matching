import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  BOARD_REC_INACTIVE,
  conditionsFromPosting,
  getBoardViewer,
  isPastDeadline,
  requirementsOf,
  totalLimitOf,
  ymd,
} from "@/lib/board";
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
  if (!partner) return <BoardSignedOut />;

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
      jobPostings: { orderBy: { updatedAt: "desc" }, take: 1 },
      boardRecommendations: {
        select: { id: true, partnerId: true, status: true, statusNote: true, candidateName: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      },
      boardQuestions: {
        where: { OR: [{ isPublic: true, answer: { not: null } }, { partnerId: partner.id }] },
        orderBy: { createdAt: "desc" },
        select: { id: true, partnerId: true, question: true, answer: true, answeredAt: true, isPublic: true, createdAt: true },
      },
    },
  });
  if (!deal || deal.boardStatus === "hidden") notFound();

  const active = deal.boardRecommendations.filter((r) => !BOARD_REC_INACTIVE.includes(r.status));
  const myActive = active.filter((r) => r.partnerId === partner.id).length;
  const totalLimit = totalLimitOf(deal);
  const closed = deal.boardStatus === "closed" || isPastDeadline(deal.deadline);
  const full = active.length >= totalLimit;
  const posting = deal.jobPostings[0] ?? null;

  return (
    <div className="min-h-screen bg-[var(--color-light)]">
      <BoardHeader partnerName={partner.name} />
      <DealBoardClient
        preview={partner.preview}
        deal={{
          id: deal.id,
          title: deal.boardTitle ?? `案件 ${deal.id}`,
          field: deal.field ?? "",
          area: deal.boardArea ?? "",
          summary: deal.boardSummary ?? "",
          fee: deal.boardPartnerFee ?? "",
          openings: deal.requiredCount,
          deadline: ymd(deal.deadline),
          publishedAt: ymd(deal.boardPublishedAt),
          updatedAt: ymd(deal.updatedAt),
          jobChangeScope: deal.boardJobChangeScope ?? "",
          placeChangeScope: deal.boardPlaceChangeScope ?? "",
          renewalLimit: deal.boardRenewalLimit ?? "",
          requirements: requirementsOf(deal.boardRequirements),
          conditions: conditionsFromPosting(posting as unknown as Record<string, unknown> | null),
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
        questions={deal.boardQuestions.map((q) => ({
          id: q.id,
          question: q.question,
          answer: q.answer ?? "",
          answeredAt: ymd(q.answeredAt),
          mine: q.partnerId === partner.id,
          isPublic: q.isPublic,
        }))}
      />
    </div>
  );
}
