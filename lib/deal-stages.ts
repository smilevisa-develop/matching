/**
 * 企業 (Deal) の募集状況と、候補者の進捗ステージの定義。
 * 企業詳細のカンバンと進捗管理の両方で同じものを使う。
 */

/** 候補者の進捗ステージ (企業詳細のカンバンの列) */
export const CANDIDATE_STAGES = [
  "接続済み",
  "事前面談済み",
  "推薦済み",
  "面接済み",
  "内定済み",
  "内定辞退",
  "書類NG",
  "面談NG",
  "不合格",
] as const;

export type CounterField =
  | "recommendedCount"
  | "interviewCount"
  | "offerCount"
  | "declineCount"
  | "rejectCount";

// 選考が進む順。ここを通過するたびに対応する人数カウンターを 1 増やす
const PIPELINE: { stage: string; counter: CounterField | null }[] = [
  { stage: "接続済み", counter: null },
  { stage: "事前面談済み", counter: null },
  { stage: "推薦済み", counter: "recommendedCount" },
  { stage: "面接済み", counter: "interviewCount" },
  { stage: "内定済み", counter: "offerCount" },
];

// 選考の流れから外れる列。入ったときに 1 増やし、戻したら 1 減らす
const EXIT_COUNTERS: Record<string, CounterField> = {
  内定辞退: "declineCount",
  不合格: "rejectCount",
};

/**
 * 候補者をカンバンで動かしたときに、人数カウンターをいくつ増減するかを返す。
 *
 * - 先へ進めたら、通過した段階ぶん増やす (事前面談済み → 内定済み なら 推薦・面接・内定 が +1)
 * - 間違えて進めたものを戻したら、そのぶん減らす
 * - 内定辞退 / 不合格 は入ったら +1、出したら -1。それまでに数えた推薦・面接・内定はそのまま
 * - 書類NG / 面談NG は数えない
 */
export function stageCounterDeltas(prev: string, next: string): Partial<Record<CounterField, number>> {
  const deltas: Partial<Record<CounterField, number>> = {};
  const add = (field: CounterField | null, n: number) => {
    if (field) deltas[field] = (deltas[field] ?? 0) + n;
  };
  if (prev === next) return deltas;

  add(EXIT_COUNTERS[prev] ?? null, -1);
  add(EXIT_COUNTERS[next] ?? null, 1);

  const from = PIPELINE.findIndex((p) => p.stage === prev);
  const to = PIPELINE.findIndex((p) => p.stage === next);
  if (from >= 0 && to >= 0) {
    for (let i = from + 1; i <= to; i++) add(PIPELINE[i].counter, 1);
    for (let i = to + 1; i <= from; i++) add(PIPELINE[i].counter, -1);
  }
  return deltas;
}

/**
 * 企業の募集状況 (Deal.status)。企業一覧・企業詳細・進捗管理すべてでこの表記を使う。
 * スプシへ書くときだけ lib/deal-sheet-sync.ts の toSheetStatus で表記を変える。
 */
export const DEAL_STATUSES = ["至急募集", "募集中", "面接中", "成約", "一時中断", "ストップ"] as const;

// 過去に使っていた表記・スプシ側の表記 → 今の表記
const STATUS_ALIAS: Record<string, string> = {
  "！至急募集！": "至急募集",
  クローズ: "ストップ",
  停止: "ストップ",
};

export function normalizeDealStatus(status: string | null | undefined): string {
  const s = (status ?? "").trim();
  return STATUS_ALIAS[s] ?? (s || "募集中");
}

export type DealGroup = "urgent" | "open" | "stopped";

export function dealGroup(status: string): DealGroup {
  const s = normalizeDealStatus(status);
  if (s === "至急募集") return "urgent";
  if (["成約", "一時中断", "ストップ", "失注"].includes(s)) return "stopped";
  return "open";
}

/** 企業IDの形式 (半角英数字のみ。例: 73sv)。これ以外はスプシの企業マスタに載せられない */
export const COMPANY_EXTERNAL_ID_RE = /^[0-9a-z]+$/;
