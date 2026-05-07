/**
 * 求人票テキストから取れた値の正規化ユーティリティ。
 *
 * - "208,040 円"        → 208040
 * - "6,000 円/回"       → { amount: 6000, unit: "円/回" }
 * - "2.5h /月"          → 2.5
 * - "110 日"            → 110
 * - "あり" / "○" / "Y"  → true
 * - "なし" / "−" / "N"  → false
 * - "2026年4月1日"     → "2026-04-01"
 * - "2026/04/01"        → "2026-04-01"
 */

export function normalizeMoneyToNumber(input: string | null | undefined): number | null {
  if (input == null) return null;
  const cleaned = String(input)
    .normalize("NFKC")
    .replace(/[¥$,\s]/g, "")
    .replace(/円$/g, "")
    .replace(/円.*$/g, ""); // "円/月" 等は単位を別で扱うのでここでは数値化のみ
  const m = cleaned.match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

export function normalizeNumberWithUnit(input: string | null | undefined): {
  amount: number | null;
  unit: string;
} {
  if (input == null) return { amount: null, unit: "" };
  const norm = String(input).normalize("NFKC").trim();
  const m = norm.match(/(-?\d+(?:\.\d+)?)\s*(.*)$/);
  if (!m) return { amount: null, unit: "" };
  const amount = Number(m[1]);
  const unit = (m[2] ?? "").trim();
  return { amount: Number.isFinite(amount) ? amount : null, unit };
}

export function normalizeHours(input: string | null | undefined): number | null {
  if (input == null) return null;
  const norm = String(input).normalize("NFKC").replace(/[\s,]/g, "");
  const m = norm.match(/(-?\d+(?:\.\d+)?)\s*(?:h|時間)?/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

export function normalizeDays(input: string | null | undefined): number | null {
  if (input == null) return null;
  const norm = String(input).normalize("NFKC").replace(/[\s,]/g, "");
  const m = norm.match(/(-?\d+(?:\.\d+)?)\s*日?/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

const TRUTHY = ["あり", "有", "○", "◯", "yes", "y", "true", "可", "実施"];
const FALSY = ["なし", "無", "×", "—", "ー", "-", "no", "n", "false", "不可"];

export function normalizeBool(input: string | null | undefined): boolean | null {
  if (input == null) return null;
  const v = String(input).normalize("NFKC").trim().toLowerCase();
  if (v === "") return null;
  if (TRUTHY.some((t) => v.includes(t))) return true;
  if (FALSY.some((t) => v.includes(t))) return false;
  return null;
}

export function normalizeDate(input: string | null | undefined): string {
  if (input == null) return "";
  const v = String(input).normalize("NFKC").trim();
  // 2026年4月1日 / 2026/04/01 / 2026-04-01
  const m1 = v.match(/(\d{4})[\/年\-](\d{1,2})[\/月\-](\d{1,2})/);
  if (m1) {
    const [, y, mo, d] = m1;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // 2026年4月
  const m2 = v.match(/(\d{4})[年\-](\d{1,2})月?/);
  if (m2) return `${m2[1]}-${m2[2].padStart(2, "0")}`;
  return v;
}

/**
 * "9:00 ~ 18:00 (休憩60分)" → { timeRange: "09:00〜18:00", breakMinutes: 60 }
 */
export function normalizeShift(input: string | null | undefined): {
  timeRange: string;
  breakMinutes: number | null;
} {
  if (input == null) return { timeRange: "", breakMinutes: null };
  const v = String(input).normalize("NFKC").trim();
  // 時刻範囲
  const range = v.match(/(\d{1,2}:\d{2})\s*[~〜~ーー\-―]\s*(\d{1,2}:\d{2})/);
  const start = range?.[1] ?? "";
  const end = range?.[2] ?? "";
  const timeRange = start && end ? `${pad2(start)}〜${pad2(end)}` : v;
  // 休憩 60 分
  const br = v.match(/休憩[^\d]{0,3}(\d+)\s*分/);
  const breakMinutes = br ? Number(br[1]) : null;
  return { timeRange, breakMinutes };
}

function pad2(t: string) {
  const [h, m] = t.split(":");
  return `${h.padStart(2, "0")}:${(m ?? "00").padStart(2, "0")}`;
}

/** "208,040 円" や "20.8 万円" を整数 (円単位) に揃える */
export function normalizeYen(input: string | null | undefined): number | null {
  if (input == null) return null;
  const v = String(input).normalize("NFKC");
  // 万円表記
  const man = v.match(/(\d+(?:\.\d+)?)\s*万円/);
  if (man) return Math.round(Number(man[1]) * 10000);
  return normalizeMoneyToNumber(v);
}
