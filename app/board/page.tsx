import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { BOARD_REC_INACTIVE, fieldMatches, getBoardLang, getBoardViewer, isPastDeadline, totalLimitOf } from "@/lib/board";
import { ensureDealTranslations, pickTexts } from "@/lib/board-translate";
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
  const lang = await getBoardLang(partner);
  if (!partner) return <BoardSignedOut lang={lang} invalid={invalid === "1"} />;

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
      boardTranslations: true,
      jobPostings: { orderBy: { updatedAt: "desc" }, take: 1, select: { monthlyGross: true } },
      boardRecommendations: { select: { partnerId: true, status: true } },
      boardQuestions: { where: { isPublic: true, answer: { not: null } }, select: { id: true } },
    },
  });

  // 選んだ言語の訳 (無い項目は日本語のまま。訳が足りない案件は、応答のあとに訳しておく)
  const needTranslation: number[] = [];
  const textsById = new Map<number, Record<string, string>>();
  for (const d of deals) {
    const current: Record<string, string> = {};
    const put = (k: string, v: string | null | undefined) => {
      if (v?.trim()) current[k] = v.trim();
    };
    put("title", d.boardTitle);
    put("field", d.field);
    put("area", d.boardArea);
    put("summary", d.boardSummary);
    put("fee", d.boardPartnerFee);
    put("c.monthlyGross", d.jobPostings[0]?.monthlyGross);
    const picked = pickTexts(d.boardTranslations, current, lang);
    if (picked.missing) needTranslation.push(d.id);
    textsById.set(d.id, picked.texts);
  }
  if (needTranslation.length) after(async () => {
    for (const id of needTranslation.slice(0, 5)) await ensureDealTranslations(id);
  });

  const items: BoardListItem[] = deals.map((d) => {
    const t = textsById.get(d.id) ?? {};
    const active = d.boardRecommendations.filter((r) => !BOARD_REC_INACTIVE.includes(r.status));
    const mine = active.filter((r) => r.partnerId === partner.id).length;
    const total = totalLimitOf(d);
    const closed = d.boardStatus === "closed" || isPastDeadline(d.deadline);
    return {
      id: d.id,
      title: t.title ?? `#${d.id}`,
      field: d.field ?? "",
      fieldLabel: t.field ?? d.field ?? "",
      area: t.area ?? "",
      summary: t.summary ?? "",
      fee: t.fee ?? "",
      monthlyGross: t["c.monthlyGross"] ?? "",
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
      <BoardHeader lang={lang} partnerName={partner.name} />
      <BoardListClient lang={lang} items={items} myRecs={myRecs} translating={lang !== "ja" && needTranslation.length > 0} />
    </div>
  );
}
