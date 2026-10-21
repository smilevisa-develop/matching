/**
 * KPI ダッシュボード (/kpi) の集計。
 *
 * 期間 (直近 N か月 / 全期間) の件数・転換率・かかった日数・内訳と、過去も含めた累計を出す。
 * 段階ごとの件数・日数は、カンバンで動かしたときに入れた日付 (DealCandidate.stageDates) で数える。
 * 2026/10/19 より前の動きは日付の記録が無いので、その期間の推薦・面接などは少なく出る
 * (内定日・内定承諾日は内定者管理の日付も使う)。累計は案件ごとの人数カウンター (過去分を含む) を足したもの。
 * テスト企業 (00sv など) は数えない。
 */

import { prisma } from "@/lib/prisma";
import { readFilledStages, readStageDates } from "@/lib/deal-stages";
import { isTestCompany } from "@/lib/test-companies";
import { currentMonthJst, shiftMonth } from "@/lib/month-stats";

export type KpiPeriod = "1" | "2" | "3" | "6" | "all";

const STAGES = [
  ["接続済み", "接続"],
  ["事前面談済み", "事前面談"],
  ["推薦済み", "推薦"],
  ["面接済み", "面接"],
  ["内定済み", "内定"],
  ["内定承諾", "内定承諾"],
  ["内定辞退", "内定辞退"],
  ["不合格", "不合格"],
  ["書類NG", "書類NG"],
  ["面談NG", "面談NG"],
  ["選考NG", "選考NG"],
] as const;

const DAY = 86_400_000;
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);
const ymdJst = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

export async function computeKpiDashboard(period: KpiPeriod) {
  const thisMonth = currentMonthJst();
  const fromMonth = period === "all" ? "0000-00" : shiftMonth(thisMonth, -(Number(period) - 1));
  const fromYmd = `${fromMonth}-01`;
  const inPeriod = (ymd: string | null | undefined) => Boolean(ymd && ymd >= fromYmd);

  const [candidates, persons, placements, deals] = await Promise.all([
    prisma.dealCandidate.findMany({
      select: {
        stage: true,
        stageDates: true,
        person: { select: { id: true, nationality: true, partner: { select: { name: true } } } },
        deal: { select: { owner: { select: { name: true } }, company: { select: { externalId: true, name: true } } } },
      },
    }),
    prisma.person.findMany({ select: { createdAt: true, nationality: true } }),
    prisma.personPlacement.findMany({
      select: { offerAt: true, offerAcceptedAt: true, joinAt: true, personId: true },
    }),
    prisma.deal.findMany({
      select: {
        recommendedCount: true,
        interviewCount: true,
        offerCount: true,
        declineCount: true,
        rejectCount: true,
        company: { select: { externalId: true } },
      },
    }),
  ]);
  const real = candidates.filter((c) => !isTestCompany(c.deal.company.externalId));

  // ── 期間の件数 (その段階に入った日が期間内) ──
  const counts: Record<string, number> = Object.fromEntries(STAGES.map(([, label]) => [label, 0]));
  for (const c of real) {
    const d = readStageDates(c.stageDates);
    for (const [stage, label] of STAGES) if (inPeriod(d[stage])) counts[label]++;
  }
  // 内定・内定承諾は内定者管理の日付も使う (カンバンで日付を入れる前の内定も拾う)。同じ人を二重に数えない
  const kanbanOffer = new Set(real.filter((c) => inPeriod(readStageDates(c.stageDates)["内定済み"])).map((c) => c.person.id));
  const kanbanAccepted = new Set(real.filter((c) => inPeriod(readStageDates(c.stageDates)["内定承諾"])).map((c) => c.person.id));
  for (const p of placements) {
    if (p.personId && p.offerAt && inPeriod(ymdJst(p.offerAt)) && !kanbanOffer.has(p.personId)) counts["内定"]++;
    if (p.personId && p.offerAcceptedAt && inPeriod(ymdJst(p.offerAcceptedAt)) && !kanbanAccepted.has(p.personId)) counts["内定承諾"]++;
  }
  const newCandidates = persons.filter((p) => inPeriod(ymdJst(p.createdAt))).length;
  const joined = placements.filter((p) => p.joinAt && inPeriod(ymdJst(p.joinAt))).length;

  // ── 転換率 (期間) ──
  // 分母と分子を同じ記録 (カンバンの日付) だけで数える。内定者管理の内定日を混ぜると、
  // 面接の記録が無い内定が増えて 300% のようなおかしな値になるため
  const kc: Record<string, number> = Object.fromEntries(STAGES.map(([, label]) => [label, 0]));
  for (const c of real) {
    const d = readStageDates(c.stageDates);
    for (const [stage, label] of STAGES) if (inPeriod(d[stage])) kc[label]++;
  }
  const rate = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);
  const conversions = [
    { label: "推薦 → 面接", value: rate(kc["面接"], kc["推薦"]), base: `${kc["面接"]} / ${kc["推薦"]}` },
    { label: "面接 → 内定", value: rate(kc["内定"], kc["面接"]), base: `${kc["内定"]} / ${kc["面接"]}` },
    { label: "内定 → 内定承諾", value: rate(kc["内定承諾"], kc["内定"]), base: `${kc["内定承諾"]} / ${kc["内定"]}` },
    { label: "内定辞退 / 内定", value: rate(kc["内定辞退"], kc["内定"]), base: `${kc["内定辞退"]} / ${kc["内定"]}` },
  ];

  // ── かかった日数 (後ろの段階の日付が期間内のもの) ──
  const pairs: [string, string, string][] = [
    ["接続済み", "推薦済み", "接続 → 推薦"],
    ["推薦済み", "面接済み", "推薦 → 面接"],
    ["面接済み", "内定済み", "面接 → 内定（面接合格まで）"],
    ["推薦済み", "内定済み", "推薦 → 内定"],
    ["内定済み", "内定承諾", "内定 → 内定承諾"],
  ];
  const durations = pairs.map(([a, b, label]) => {
    const list: number[] = [];
    for (const c of real) {
      const d = readStageDates(c.stageDates);
      // 飛ばして自動で埋めた日付は実際の日ではないので使わない
      const filled = readFilledStages(c.stageDates);
      if (filled.has(a) || filled.has(b)) continue;
      if (d[a] && d[b] && inPeriod(d[b])) {
        const n = days(d[a], d[b]);
        if (n >= 0) list.push(n);
      }
    }
    return { label, ...summarize(list) };
  });
  const offerToJoin: number[] = [];
  for (const p of placements) {
    if (p.offerAt && p.joinAt && inPeriod(ymdJst(p.joinAt))) {
      const n = Math.round((p.joinAt.getTime() - p.offerAt.getTime()) / DAY);
      if (n >= 0) offerToJoin.push(n);
    }
  }
  durations.push({ label: "内定 → 入社", ...summarize(offerToJoin) });

  // ── 内訳 (期間) ──
  const tally = (rows: { key: string; recommend: boolean; interview: boolean; offer: boolean }[]) => {
    const map = new Map<string, { key: string; recommend: number; interview: number; offer: number }>();
    for (const r of rows) {
      const cur = map.get(r.key) ?? { key: r.key, recommend: 0, interview: 0, offer: 0 };
      if (r.recommend) cur.recommend++;
      if (r.interview) cur.interview++;
      if (r.offer) cur.offer++;
      map.set(r.key, cur);
    }
    return [...map.values()].filter((v) => v.recommend + v.interview + v.offer > 0).sort((x, y) => y.offer - x.offer || y.recommend - x.recommend);
  };
  const rowFor = (key: string, c: (typeof real)[number]) => {
    const d = readStageDates(c.stageDates);
    return { key, recommend: inPeriod(d["推薦済み"]), interview: inPeriod(d["面接済み"]), offer: inPeriod(d["内定済み"]) };
  };
  const byOwner = tally(real.map((c) => rowFor(c.deal.owner?.name ?? "未設定", c)));
  const byPartner = tally(real.map((c) => rowFor(c.person.partner?.name ?? "（パートナーなし）", c))).slice(0, 10);
  const byCompany = tally(real.map((c) => rowFor(c.deal.company.name, c))).slice(0, 10);
  const nationality = new Map<string, number>();
  for (const p of persons) if (inPeriod(ymdJst(p.createdAt))) nationality.set(p.nationality, (nationality.get(p.nationality) ?? 0) + 1);
  const byNationality = [...nationality.entries()].sort((a, b) => b[1] - a[1]).map(([key, n]) => ({ key, n }));

  // ── 月別の推移 (直近 6 か月) ──
  const months = Array.from({ length: 6 }, (_, i) => shiftMonth(thisMonth, -(5 - i)));
  const monthly = months.map((m) => {
    const inM = (ymd: string | null | undefined) => Boolean(ymd && ymd.startsWith(m));
    const row = { month: m, candidates: 0, recommend: 0, interview: 0, offer: 0, decline: 0, reject: 0 };
    row.candidates = persons.filter((p) => inM(ymdJst(p.createdAt))).length;
    const offered = new Set<number>();
    for (const c of real) {
      const d = readStageDates(c.stageDates);
      if (inM(d["推薦済み"])) row.recommend++;
      if (inM(d["面接済み"])) row.interview++;
      if (inM(d["内定済み"])) {
        row.offer++;
        offered.add(c.person.id);
      }
      if (inM(d["内定辞退"])) row.decline++;
      if (inM(d["不合格"])) row.reject++;
    }
    for (const p of placements) if (p.personId && p.offerAt && inM(ymdJst(p.offerAt)) && !offered.has(p.personId)) row.offer++;
    return row;
  });

  // ── 累計 (過去分を含む。案件ごとの人数カウンターの合計) ──
  const realDeals = deals.filter((d) => !isTestCompany(d.company.externalId));
  const sum = (k: "recommendedCount" | "interviewCount" | "offerCount" | "declineCount" | "rejectCount") =>
    realDeals.reduce((n, d) => n + d[k], 0);
  const totals = {
    candidates: persons.length,
    recommend: sum("recommendedCount"),
    interview: sum("interviewCount"),
    offer: sum("offerCount"),
    decline: sum("declineCount"),
    reject: sum("rejectCount"),
    joined: placements.filter((p) => p.joinAt).length,
    deals: realDeals.length,
  };

  return { period, fromMonth, counts, newCandidates, joined, conversions, durations, byOwner, byPartner, byCompany, byNationality, monthly, totals };
}

function summarize(list: number[]) {
  if (list.length === 0) return { n: 0, avg: null as number | null, median: null as number | null };
  const sorted = [...list].sort((a, b) => a - b);
  const avg = Math.round((list.reduce((a, b) => a + b, 0) / list.length) * 10) / 10;
  const median = sorted[Math.floor(sorted.length / 2)];
  return { n: list.length, avg, median };
}
