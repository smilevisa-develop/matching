/**
 * 月ごとの目標 (内定数 / 売上) の正規化ユーティリティ。
 *
 * 形式: [{ month: "2026-04", offer: 5, revenue: 1500000 }, ...]
 * - month は YYYY-MM (1..12)
 * - offer / revenue は >= 0 の整数 or null
 */

export type MonthlyTarget = {
  month: string; // YYYY-MM
  /** 内定者数 */
  offer: number | null;
  /** 売上 (円) */
  revenue: number | null;
  /** 求人数 (新規受注した案件件数) */
  jobOpenings: number | null;
  /** 推薦社数 (推薦リスト送付した企業数) */
  recommendCount: number | null;
};

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function toIntOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(/[,\s]/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

export function sanitizeMonthlyTargets(input: unknown): MonthlyTarget[] {
  if (!Array.isArray(input)) return [];
  const normalized: MonthlyTarget[] = [];
  const seen = new Set<string>();
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const month = typeof rec.month === "string" ? rec.month.trim() : "";
    if (!MONTH_RE.test(month)) continue;
    if (seen.has(month)) continue;
    seen.add(month);
    normalized.push({
      month,
      offer: toIntOrNull(rec.offer),
      revenue: toIntOrNull(rec.revenue),
      jobOpenings: toIntOrNull(rec.jobOpenings),
      recommendCount: toIntOrNull(rec.recommendCount),
    });
  }
  // 月の昇順 (古い → 新しい)
  normalized.sort((a, b) => a.month.localeCompare(b.month));
  return normalized;
}

/**
 * 指定の月 (YYYY-MM) の目標を返す。完全一致 → 直近の過去月のフォールバック → null。
 */
export function findTargetForMonth(
  targets: MonthlyTarget[],
  month: string
): MonthlyTarget | null {
  const exact = targets.find((t) => t.month === month);
  if (exact) return exact;
  // 当月よりも前で最も新しい (繰り越し用) を探す
  const past = targets.filter((t) => t.month <= month);
  if (past.length === 0) return null;
  return past[past.length - 1];
}

export function currentMonthKey(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}
