/**
 * 進捗管理の「Slack 用にコピー」で作る報告文。
 *
 * 川村さんの指示 (2026/10): 一目で「期日に対して止まっていて、注力すべきか」が分かるように。
 * 内定者フォローも同様に、順調か進んでいないかが分かるように。
 * そのため、要対応 (赤・黄) を先頭にまとめ、順調なものは件数だけにする。
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
  const withAlert = open.map((c) => ({ c, ...companyAlert(c, now) }));
  const alerts = withAlert
    .filter((a) => a.level !== "normal")
    .sort((a, b) => (a.level === b.level ? 0 : a.level === "red" ? -1 : 1));
  const fine = withAlert.filter((a) => a.level === "normal");
  const followAlerts = input.followUps
    .filter((f) => f.level !== "normal")
    .sort((a, b) => (a.level === b.level ? 0 : a.level === "red" ? -1 : 1));
  const followFine = input.followUps.length - followAlerts.length;

  const date = input.date.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric" });
  const target = input.offerTarget
    ? `${input.offersThisMonth}/${input.offerTarget}名（${Math.round((input.offersThisMonth / input.offerTarget) * 100)}%）`
    : `${input.offersThisMonth}名`;
  const urgentCount = open.filter((c) => dealGroup(c.status) === "urgent").length;

  const lines: string[] = [];
  lines.push(`【${date} 進捗】今月の内定 ${target}・募集中 ${open.length}社（うち至急 ${urgentCount}社）`);
  lines.push("");
  lines.push(`■要対応の案件 ${alerts.length}社`);
  if (alerts.length === 0) lines.push("なし");
  for (const a of alerts) lines.push(`${mark(a.level)} ${companyLine(a.c)}｜${a.reason}`);
  lines.push("");
  lines.push(`■内定者フォロー 要対応 ${followAlerts.length}名`);
  if (followAlerts.length === 0) lines.push("なし");
  for (const f of followAlerts) {
    lines.push(`${mark(f.level)} ${f.name}${f.companyName ? `（${f.companyName}）` : ""}${f.ownerName ? ` 担当:${f.ownerName}` : ""}｜${f.reasons.join("・")}`);
  }
  lines.push("");
  lines.push(`順調: 案件 ${fine.length}社・内定者 ${followFine}名`);
  for (const a of fine) lines.push(`・${companyLine(a.c)}`);
  lines.push("");
  lines.push(`詳細 → ${input.url}`);
  return lines.join("\n");
}
