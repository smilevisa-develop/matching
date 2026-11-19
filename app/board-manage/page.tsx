import { prisma } from "@/lib/prisma";
import { requireCurrentAccount } from "@/lib/auth";
import {
  BOARD_REC_INACTIVE,
  boardEnterUrl,
  missingForOpen,
  requirementsOf,
  totalLimitOf,
  ymd,
} from "@/lib/board";
import BoardManageClient, {
  type ManageDeal,
  type ManagePartner,
  type ManageQuestion,
  type ManageRec,
} from "./BoardManageClient";

export const dynamic = "force-dynamic";

/**
 * 案件ボードの管理 (社員用)。
 * 案件を公開する・推薦の状況を返す・質問に答える・パートナーに専用リンクを出す。
 */
export default async function BoardManagePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  await requireCurrentAccount();
  const { tab } = await searchParams;

  // 4 つは順に読む (どれも小さい表で数十ミリ秒。並べて同時に投げる必要がない)
  const deals = await prisma.deal.findMany({
    where: { OR: [{ status: "募集中" }, { boardStatus: { not: "hidden" } }] },
    orderBy: [{ boardStatus: "desc" }, { id: "desc" }],
    select: {
      id: true,
      title: true,
      field: true,
      status: true,
      requiredCount: true,
      deadline: true,
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
      company: { select: { name: true } },
      jobPostings: { select: { id: true }, take: 1 },
      boardRecommendations: { select: { status: true } },
      boardQuestions: { where: { answer: null }, select: { id: true } },
    },
  });
  const recs = await prisma.boardRecommendation.findMany({
    orderBy: { createdAt: "desc" },
    take: 300,
    include: {
      partner: { select: { name: true } },
      deal: {
        select: {
          id: true,
          title: true,
          boardTitle: true,
          company: { select: { name: true } },
        },
      },
    },
  });
  const questions = await prisma.boardQuestion.findMany({
    orderBy: [
      { answeredAt: { sort: "asc", nulls: "first" } },
      { createdAt: "desc" },
    ],
    take: 300,
    include: {
      partner: { select: { name: true } },
      deal: { select: { id: true, title: true, boardTitle: true } },
    },
  });
  const partners = await prisma.partner.findMany({
    where: { isActive: true },
    orderBy: [{ boardEnabled: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      country: true,
      role: true,
      relationshipStatus: true,
      boardEnabled: true,
      boardToken: true,
      licenseNumber: true,
    },
  });

  const manageDeals: ManageDeal[] = deals.map((d) => ({
    id: d.id,
    title: d.title,
    companyName: d.company.name,
    field: d.field ?? "",
    status: d.status,
    requiredCount: d.requiredCount,
    deadline: d.deadline ? d.deadline.toISOString().slice(0, 10) : "",
    hasPosting: d.jobPostings.length > 0,
    boardStatus: d.boardStatus,
    boardTitle: d.boardTitle ?? "",
    boardArea: d.boardArea ?? "",
    boardSummary: d.boardSummary ?? "",
    boardPartnerFee: d.boardPartnerFee ?? "",
    boardRequirements: requirementsOf(d.boardRequirements).join("\n"),
    boardJobChangeScope: d.boardJobChangeScope ?? "",
    boardPlaceChangeScope: d.boardPlaceChangeScope ?? "",
    boardRenewalLimit: d.boardRenewalLimit ?? "",
    boardPerPartnerLimit: d.boardPerPartnerLimit,
    boardTotalLimit: d.boardTotalLimit,
    effectiveTotalLimit: totalLimitOf(d),
    publishedAt: ymd(d.boardPublishedAt),
    activeRecs: d.boardRecommendations.filter(
      (r) => !BOARD_REC_INACTIVE.includes(r.status),
    ).length,
    openQuestions: d.boardQuestions.length,
    missing: missingForOpen(d),
  }));

  const manageRecs: ManageRec[] = recs.map((r) => ({
    id: r.id,
    createdAt: ymd(r.createdAt),
    partnerName: r.partner.name,
    dealId: r.deal.id,
    dealLabel: `${r.deal.company.name} / ${r.deal.boardTitle || r.deal.title}`,
    candidateName: r.candidateName,
    details: [
      r.nationality,
      r.age ? `${r.age}歳` : null,
      r.gender,
      r.residence,
      r.residenceStatus,
      r.japaneseLevel ? `日本語 ${r.japaneseLevel}` : null,
      r.experience,
    ]
      .filter(Boolean)
      .join(" ・ "),
    resumeUrl: r.resumeUrl ?? "",
    note: r.note ?? "",
    status: r.status,
    statusNote: r.statusNote ?? "",
  }));

  const manageQuestions: ManageQuestion[] = questions.map((q) => ({
    id: q.id,
    createdAt: ymd(q.createdAt),
    partnerName: q.partner?.name ?? "(削除されたパートナー)",
    dealId: q.deal.id,
    dealLabel: q.deal.boardTitle || q.deal.title,
    question: q.question,
    answer: q.answer ?? "",
    isPublic: q.isPublic,
    answeredAt: ymd(q.answeredAt),
  }));

  const managePartners: ManagePartner[] = partners.map((p) => ({
    id: p.id,
    name: p.name,
    country: p.country ?? "",
    role: p.role ?? "",
    relationship: p.relationshipStatus ?? "",
    boardEnabled: p.boardEnabled,
    licenseNumber: p.licenseNumber ?? "",
    link: p.boardToken ? boardEnterUrl(p.boardToken) : "",
  }));

  return (
    <BoardManageClient
      initialTab={
        tab === "recs" || tab === "qa" || tab === "partners" ? tab : "deals"
      }
      deals={manageDeals}
      recs={manageRecs}
      questions={manageQuestions}
      partners={managePartners}
    />
  );
}
