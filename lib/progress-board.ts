/**
 * 進捗ボード (/personnel/progress) と候補者詳細「進捗 / 日程」で使う、内定承諾〜申請結果までの日程の読み出し。
 */

import { prisma } from "@/lib/prisma";
import { EXIT_STAGES, readFilledStages, readStageDates } from "@/lib/deal-stages";
import type { PlacementData } from "@/app/personnel/[id]/edit/PlacementPanel";
import type { ProgressCard } from "@/app/personnel/progress/ProgressBoard";

/** 日本時間の日付 (内定者管理で入れた日付は日本時間 0 時。UTC のままだと前の日になる) */
export const toYmdJst = (d: Date | null | undefined) => (d ? new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10) : null);

type PlacementRow = {
  acceptedAt: Date | null;
  preInterviewAt: Date | null;
  companyInterviewAt: Date | null;
  offerAt: Date | null;
  offerAcceptedAt: Date | null;
  applicationPlannedAt: Date | null;
  applicationAt: Date | null;
  applicationResultAt: Date | null;
  applicationType: string | null;
  applicantName: string | null;
  returnHomeFlag: string | null;
  returnHomeAt: Date | null;
  entryPlannedAt: Date | null;
  entryAt: Date | null;
  joinPlannedAt: Date | null;
  joinAt: Date | null;
  sixMonthStatus: string | null;
  consultation: string | null;
  currentAction: string | null;
};

export function toPlacementData(p: PlacementRow | null | undefined): PlacementData {
  return {
    acceptedAt: toYmdJst(p?.acceptedAt),
    preInterviewAt: toYmdJst(p?.preInterviewAt),
    companyInterviewAt: toYmdJst(p?.companyInterviewAt),
    offerAt: toYmdJst(p?.offerAt),
    offerAcceptedAt: toYmdJst(p?.offerAcceptedAt),
    applicationPlannedAt: toYmdJst(p?.applicationPlannedAt),
    applicationAt: toYmdJst(p?.applicationAt),
    applicationResultAt: toYmdJst(p?.applicationResultAt),
    applicationType: p?.applicationType ?? null,
    applicantName: p?.applicantName ?? null,
    returnHomeFlag: p?.returnHomeFlag ?? null,
    returnHomeAt: toYmdJst(p?.returnHomeAt),
    entryPlannedAt: toYmdJst(p?.entryPlannedAt),
    entryAt: toYmdJst(p?.entryAt),
    joinPlannedAt: toYmdJst(p?.joinPlannedAt),
    joinAt: toYmdJst(p?.joinAt),
    sixMonthStatus: p?.sixMonthStatus ?? null,
    consultation: p?.consultation ?? null,
    currentAction: p?.currentAction ?? null,
  };
}

const KANBAN_DATE_FIELDS: Record<string, string> = {
  事前面談済み: "preInterviewAt",
  面接済み: "companyInterviewAt",
  内定済み: "offerAt",
  内定承諾: "offerAcceptedAt",
};

/**
 * カンバンで動かしたときの日付 (進捗 / 日程が空のときの候補として出す)。
 * 途中を飛ばして自動で埋めた日付は使わない。求人受付は求人の受付日
 */
export function kanbanDatesOf(dealCandidates: { stageDates: unknown; deal: { acceptedAt: Date | null } }[]) {
  const out: Partial<Record<string, string>> = {};
  for (const dc of dealCandidates) {
    const dates = readStageDates(dc.stageDates);
    const filled = readFilledStages(dc.stageDates);
    for (const [stage, field] of Object.entries(KANBAN_DATE_FIELDS)) {
      if (!out[field] && dates[stage] && !filled.has(stage)) out[field] = dates[stage];
    }
    if (!out.acceptedAt && dc.deal.acceptedAt) out.acceptedAt = toYmdJst(dc.deal.acceptedAt) ?? undefined;
  }
  return out;
}

/** 候補者カンバンの進み具合 (どの求人の情報を出すか選ぶため) */
const KANBAN_ORDER = ["接続済み", "事前面談済み", "推薦済み", "面接済み", "内定済み", "内定承諾", "入社待ち", "入社済み"];

/** ボードに出さない内定者管理の工程 (辞退・キャンセル) */
const DROPPED_STAGES = new Set(["declined", "card_cancelled"]);
/** 入社まで済んだ工程 */
const JOINED_STAGES = new Set(["joined", "billing"]);

/**
 * 進捗ボードのカード。選考中 (NG・辞退以外) の求人がある人と、内定者管理にカードがある人。
 * 内定辞退・キャンセルの人は出さない。
 */
export async function loadProgressCards(): Promise<ProgressCard[]> {
  const persons = await prisma.person.findMany({
    where: {
      OR: [
        { dealCandidates: { some: { stage: { notIn: [...EXIT_STAGES] } } } },
        { placement: { stage: { notIn: ["pre", ...DROPPED_STAGES] } } },
      ],
    },
    select: {
      id: true,
      name: true,
      onboarding: { select: { englishName: true } },
      placement: true,
      dealCandidates: {
        orderBy: { updatedAt: "desc" },
        select: {
          stage: true,
          stageDates: true,
          deal: { select: { acceptedAt: true, owner: { select: { name: true } }, company: { select: { name: true } } } },
        },
      },
    },
  });

  const cards: ProgressCard[] = [];
  for (const p of persons) {
    if (p.placement?.stage && DROPPED_STAGES.has(p.placement.stage)) continue;
    const active = p.dealCandidates.filter((dc) => !EXIT_STAGES.includes(dc.stage));
    // いちばん進んでいる求人の企業・担当を出す
    const main =
      [...active].sort((a, b) => KANBAN_ORDER.indexOf(b.stage) - KANBAN_ORDER.indexOf(a.stage))[0] ?? p.dealCandidates[0] ?? null;
    const english = p.onboarding?.englishName?.trim();
    cards.push({
      personId: p.id,
      name: english || p.name,
      kanaName: english ? p.name : null,
      companyName: main?.deal.company.name ?? "",
      ownerName: main?.deal.owner?.name ?? "",
      kanbanStage: main?.stage ?? "",
      placement: toPlacementData(p.placement),
      kanbanDates: kanbanDatesOf(main ? [main, ...p.dealCandidates.filter((dc) => dc !== main)] : p.dealCandidates),
      cardId: p.placement && p.placement.stage !== "pre" ? p.placement.id : null,
      joined: JOINED_STAGES.has(p.placement?.stage ?? "") || main?.stage === "入社済み",
    });
  }
  return cards;
}
