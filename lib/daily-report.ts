/**
 * 進捗管理の「Slack 用にコピー」で作る報告文。
 *
 * 川村さんの指示 (2026/10): 一目で「期日に対して止まっていて、注力すべきか」が分かるように。
 * 内定者フォローも同様に、順調か進んでいないかが分かるように。
 * そのため、急ぎ (至急募集) の案件を先頭に、各欄の中では止まっている (赤・黄) 会社を上に並べる。
 */

import { dealGroup } from "./deal-stages";

/** 動きがない日数がこれ以上なら黄 / 赤 */
export const STALL_WARN_DAYS = 7;
export const STALL_ALERT_DAYS = 14;
/** 期日までこの日数以内なら黄 */
export const DEADLINE_WARN_DAYS = 7;

export type AlertLevel = "red" | "amber" | "normal";

export type ReportCompany = {
  status: string;
  companyExternalId: string | null;
  companyName: string;
  ownerName: string | null;
  recommendedCount: number;
  interviewCount: number;
  offerCount: number;
  lastActivityAt: string | null;
  deadline: string | null;
  memo: string | null;
  isTest: boolean;
};

export type ReportFollowUp = {
  name: string;
  companyName: string | null;
  ownerName: string | null;
  level: AlertLevel;
  reasons: string[];
};

const DAY = 86_400_000;

/** 企業の要対応の判定 (期日超過・期日が近い・動きがない) */
export function companyAlert(c: ReportCompany, now = Date.now()): { level: AlertLevel; reason: string | null } {
  const reds: string[] = [];
  const ambers: string[] = [];
  if (c.deadline) {
    const left = Math.ceil((new Date(c.deadline).getTime() - now) / DAY);
    if (left < 0) reds.push(`期日を${-left}日超過`);
    else if (left <= DEADLINE_WARN_DAYS) ambers.push(`期日まで${left}日`);
  }
  if (c.lastActivityAt) {
    const idle = Math.floor((now - new Date(c.lastActivityAt).getTime()) / DAY);
    if (idle >= STALL_ALERT_DAYS) reds.push(`${idle}日動きなし`);
    else if (idle >= STALL_WARN_DAYS) ambers.push(`${idle}日動きなし`);
  }
  if (reds.length) return { level: "red", reason: [...reds, ...ambers].join("・") };
  if (ambers.length) return { level: "amber", reason: ambers.join("・") };
  return { level: "normal", reason: null };
}

const mark = (level: AlertLevel) => (level === "red" ? "🔴" : "🟡");
const who = (name: string | null) => (name ? `（${name}）` : "");

function companyLine(c: ReportCompany): string {
  const id = c.companyExternalId ? `${c.companyExternalId} ` : "";
  const counts = `推薦${c.recommendedCount} 面接${c.interviewCount} 内定${c.offerCount}`;
  return `${id}${c.companyName}${who(c.ownerName)} ${counts}${c.memo ? `｜${c.memo}` : ""}`;
}

export function buildDailyReport(input: {
  date: Date;
  offersThisMonth: number;
  offerTarget: number | null;
  companies: ReportCompany[];
  followUps: ReportFollowUp[];
  url: string;
}): string {
  const now = input.date.getTime();
  const open = input.companies.filter((c) => !c.isTest && dealGroup(c.status) !== "stopped");
  const rank = (level: AlertLevel) => (level === "red" ? 0 : level === "amber" ? 1 : 2);
  // 止まっている (赤・黄) 会社を上に。同じ色の中は元の並び (企業ID順) のまま
  const withAlert = (list: ReportCompany[]) =>
    list
      .map((c, i) => ({ c, i, ...companyAlert(c, now) }))
      .sort((a, b) => rank(a.level) - rank(b.level) || a.i - b.i);
  const urgent = withAlert(open.filter((c) => dealGroup(c.status) === "urgent"));
  const normal = withAlert(open.filter((c) => dealGroup(c.status) !== "urgent"));
  const line = (a: { c: ReportCompany; level: AlertLevel; reason: string | null }) =>
    a.level === "normal" ? `・${companyLine(a.c)}` : `${mark(a.level)} ${companyLine(a.c)}｜${a.reason}`;
  const stalled = (list: { level: AlertLevel }[]) => list.filter((a) => a.level !== "normal").length;

  const followAlerts = input.followUps
    .filter((f) => f.level !== "normal")
    .sort((a, b) => rank(a.level) - rank(b.level));
  const followFine = input.followUps.length - followAlerts.length;

  const date = input.date.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric" });
  const target = input.offerTarget
    ? `${input.offersThisMonth}/${input.offerTarget}名（${Math.round((input.offersThisMonth / input.offerTarget) * 100)}%）`
    : `${input.offersThisMonth}名`;

  const lines: string[] = [];
  lines.push(`【${date} 進捗】今月の内定 ${target}・募集中 ${open.length}社（うち至急 ${urgent.length}社）`);
  lines.push("");
  lines.push(`■急ぎの案件 ${urgent.length}社${stalled(urgent) ? `（止まっている ${stalled(urgent)}社）` : ""}`);
  if (urgent.length === 0) lines.push("なし");
  for (const a of urgent) lines.push(line(a));
  lines.push("");
  lines.push(`■募集中の案件 ${normal.length}社${stalled(normal) ? `（止まっている ${stalled(normal)}社）` : ""}`);
  for (const a of normal) lines.push(line(a));
  lines.push("");
  lines.push(`■内定者フォロー 要対応 ${followAlerts.length}名（順調 ${followFine}名）`);
  if (followAlerts.length === 0) lines.push("なし");
  for (const f of followAlerts) {
    lines.push(`${mark(f.level)} ${f.name}${f.companyName ? `（${f.companyName}）` : ""} 担当:${f.ownerName ?? "未設定"}｜${f.reasons.join("・")}`);
  }
  lines.push("");
  lines.push(`詳細 → ${input.url}`);
  return lines.join("\n");
}
