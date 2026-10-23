/**
 * 月ごとの実績 (進捗管理の上部の数字と、人材紹介KPI シートへの転記で共通に使う)。
 *
 * 数え方:
 *   接続 / 面談 / 推薦 / 面接 / 内定 / 内定承諾 … カンバンで候補者を動かしたときに入れた日付
 *     (DealCandidate.stageDates) がその月なら 1。日付が無い古いデータは数えない
 *   面接待ち … 今「推薦済み」にいる人数 (月に関係なく今の状態)。募集を止めた企業 (ストップ・成約・一時中断) の人は数えない
 *   結果待ち … 今「面接済み」にいる人数 (同上)
 *   内定 … 上に加えて、内定者管理ボードに手入力した内定日 (カンバンに紐づいていない人の分)
 *   リード (候補者獲得) … その月に追加した候補者
 *   入社 … 内定者管理の入社日がその月
 *   求人 … その月に受け付けた案件 (受付日が無ければ作成日)
 * テスト企業に紐づく分は数えない。
 */

import { prisma } from "@/lib/prisma";
import { dealGroup, normalizeDealStatus, readStageDates } from "@/lib/deal-stages";
import { TEST_COMPANY_EXTERNAL_IDS, isTestCompany } from "@/lib/test-companies";

export type MonthStats = {
  connected: number;
  preInterviewed: number;
  recommended: number;
  waitingInterview: number;
  interviewed: number;
  waitingResult: number;
  offers: number;
  accepted: number;
  /** その月に追加した候補者 (リード数) */
  leads: number;
  /** その月に入社した人数 */
  joined: number;
  /** その月に受け付けた案件数 */
  newDeals: number;
};

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isMonthKey(v: unknown): v is string {
  return typeof v === "string" && MONTH_RE.test(v);
}

/** 今月 (日本時間) を "YYYY-MM" で */
export function currentMonthJst(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit" }).format(now);
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** その月の範囲 (日本時間の 1 日 0 時 〜 翌月 1 日 0 時) */
export function monthRangeJst(month: string): { gte: Date; lt: Date } {
  return {
    gte: new Date(`${month}-01T00:00:00+09:00`),
    lt: new Date(`${shiftMonth(month, 1)}-01T00:00:00+09:00`),
  };
}

export async function computeMonthStats(month: string): Promise<MonthStats> {
  const stats: MonthStats = {
    connected: 0,
    preInterviewed: 0,
    recommended: 0,
    waitingInterview: 0,
    interviewed: 0,
    waitingResult: 0,
    offers: 0,
    accepted: 0,
    leads: 0,
    joined: 0,
    newDeals: 0,
  };
  const inMonth = (ymd: string | undefined) => Boolean(ymd && ymd.startsWith(month));
  const range = monthRangeJst(month);
  const notTest = { company: { NOT: { externalId: { in: TEST_COMPANY_EXTERNAL_IDS } } } };

  const candidates = await prisma.dealCandidate.findMany({
    where: { deal: notTest },
    select: { stage: true, stageDates: true, deal: { select: { status: true, company: { select: { externalId: true } } } } },
  });
  for (const cand of candidates) {
    if (isTestCompany(cand.deal.company.externalId)) continue;
    const dates = readStageDates(cand.stageDates);
    if (inMonth(dates["接続済み"])) stats.connected++;
    if (inMonth(dates["事前面談済み"])) stats.preInterviewed++;
    if (inMonth(dates["推薦済み"])) stats.recommended++;
    if (inMonth(dates["面接済み"])) stats.interviewed++;
    if (inMonth(dates["内定済み"])) stats.offers++;
    if (inMonth(dates["内定承諾"])) stats.accepted++;
    // 人材紹介会社の候補者は内定者管理に載らないので、入社はカンバンの「入社済み」で数える
    if (inMonth(dates["入社済み"])) stats.joined++;
    // 待ちの人数は、まだ募集している企業の人だけ (止めた企業に残ったままの人は待っていないため)
    const stillOpen = dealGroup(normalizeDealStatus(cand.deal.status)) !== "stopped";
    if (stillOpen && cand.stage === "推薦済み") stats.waitingInterview++;
    if (stillOpen && cand.stage === "面接済み") stats.waitingResult++;
  }

  // 内定者管理ボードに手入力した内定日も数える (カンバンで内定済みになっている人は上で数えているので除く)
  const [boardOffers, leads, joined, newDeals] = await Promise.all([
    prisma.personPlacement.count({
      where: {
        OR: [{ offerAt: range }, { offerAt: null, offerAcceptedAt: range }],
        person: {
          // カンバンで内定まで進んだ人 (辞退・取り消し・入社も含む) は上で数えているので除く
          dealCandidates: { none: { stage: { in: ["内定済み", "内定承諾", "入社待ち", "入社済み", "内定辞退", "内定取り消し"] } } },
          NOT: { dealCandidates: { some: { deal: { company: { externalId: { in: TEST_COMPANY_EXTERNAL_IDS } } } } } },
        },
      },
    }),
    prisma.person.count({ where: { createdAt: range } }),
    prisma.personPlacement.count({
      where: {
        joinAt: range,
        person: { NOT: { dealCandidates: { some: { deal: { company: { externalId: { in: TEST_COMPANY_EXTERNAL_IDS } } } } } } },
      },
    }),
    prisma.deal.count({
      where: {
        ...notTest,
        OR: [{ acceptedAt: range }, { acceptedAt: null, createdAt: range }],
      },
    }),
  ]);
  stats.offers += boardOffers;
  stats.leads = leads;
  stats.joined += joined;
  stats.newDeals = newDeals;
  return stats;
}
