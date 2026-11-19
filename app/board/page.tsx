import { prisma } from "@/lib/prisma";
import { BOARD_REC_INACTIVE, fieldMatches, getBoardViewer, isPastDeadline, totalLimitOf } from "@/lib/board";
import BoardHeader, { BoardSignedOut } from "./_components/BoardHeader";
import BoardListClient, { type BoardListItem, type MyRecommendation } from "./BoardListClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "案件ボード / Job Board | SMILE MATCHING",
  robots: { index: false, follow: false },
};

/** パートナー向けの案件一覧 */
export default async function BoardPage({ searchParams }: { searchParams: Promise<{ invalid?: string }> }) {
  const { invalid } = await searchParams;
  const partner = await getBoardViewer();
  if (!partner) return <BoardSignedOut invalid={invalid === "1"} />;

  const deals = await prisma.deal.findMany({
    where: { boardStatus: { in: ["open", "closed"] } },
    orderBy: [{ boardPublishedAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      field: true,
      requiredCount: true,
      deadline: true,
      boardStatus: true,
      boardTitle: true,
      boardArea: true,
      boardSummary: true,
      boardPartnerFee: true,
      boardPerPartnerLimit: true,
      boardTotalLimit: true,
      boardPublishedAt: true,
      updatedAt: true,
      jobPostings: { orderBy: { updatedAt: "desc" }, take: 1, select: { monthlyGross: true } },
      boardRecommendations: { select: { partnerId: true, status: true } },
      boardQuestions: { where: { isPublic: true, answer: { not: null } }, select: { id: true } },
    },
  });

  const items: BoardListItem[] = deals.map((d) => {
    const active = d.boardRecommendations.filter((r) => !BOARD_REC_INACTIVE.includes(r.status));
    const mine = active.filter((r) => r.partnerId === partner.id).length;
    const total = totalLimitOf(d);
    const closed = d.boardStatus === "closed" || isPastDeadline(d.deadline);
    return {
      id: d.id,
      title: d.boardTitle ?? `案件 ${d.id}`,
      field: d.field ?? "",
      area: d.boardArea ?? "",
      summary: d.boardSummary ?? "",
      fee: d.boardPartnerFee ?? "",
      monthlyGross: d.jobPostings[0]?.monthlyGross ?? "",
      deadline: d.deadline ? d.deadline.toISOString() : null,
      updatedAt: d.updatedAt.toISOString(),
      openings: d.requiredCount,
      myCount: mine,
      myLimit: d.boardPerPartnerLimit,
      totalCount: active.length,
      totalLimit: total,
      qaCount: d.boardQuestions.length,
      closed,
      full: !closed && active.length >= total,
      matches: fieldMatches(partner.introducibleFields, d.field),
    };
  });

  const recs = await prisma.boardRecommendation.findMany({
    where: { partnerId: partner.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      candidateName: true,
      status: true,
      statusNote: true,
      createdAt: true,
      updatedAt: true,
      deal: { select: { id: true, boardTitle: true } },
    },
  });
  const myRecs: MyRecommendation[] = recs.map((r) => ({
    id: r.id,
    candidateName: r.candidateName,
    status: r.status,
    statusNote: r.statusNote ?? "",
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    dealId: r.deal.id,
    dealTitle: r.deal.boardTitle ?? `案件 ${r.deal.id}`,
  }));

  return (
    <div className="min-h-screen bg-[var(--color-light)]">
      <BoardHeader partnerName={partner.name} />
      <BoardListClient items={items} myRecs={myRecs} />
    </div>
  );
}
