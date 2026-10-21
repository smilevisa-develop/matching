/**
 * 企業 (Deal) の募集状況と、候補者の進捗ステージの定義。
 * 企業詳細のカンバンと進捗管理の両方で同じものを使う。
 */

/**
 * 候補者の進捗ステージ (企業詳細のカンバンの列)。
 *
 * 流れ (2026/10 採用チームの整理):
 *   接続済み → 事前面談済み → 推薦済み → 面接済み → 内定済み → 内定承諾
 *   外れる先: 書類NG (CV NG: 日本語・書類などで推薦できない) / 面談NG / 選考NG (推薦後の書類選考落ち)
 *             (面接で不合格もここ) / 内定辞退 / 内定取り消し / 応募辞退
 */
export const CANDIDATE_STAGES = [
  "接続済み",
  "事前面談済み",
  "推薦済み",
  "面接済み",
  "内定済み",
  "内定承諾",
  // 人材紹介会社 (WILLOF・ADECCO など) の企業だけで使う。内定のあとは 入社待ち → 入社済み で終わる
  "入社待ち",
  "入社済み",
  // 外れた人 (選考から外れた列)。カンバンでは下の段 / 右側にまとめて置く
  "応募辞退",
  "内定辞退",
  "書類NG",
  "面談NG",
  "選考NG",
  // 内定のあとに企業側から取り消された (2026/10 追加)。「不合格」は選考NG にまとめた
  "内定取り消し",
] as const;

export type CandidateStage = (typeof CANDIDATE_STAGES)[number];

/** 選考から外れた列 (辞退・NG・不合格)。カンバンでは進行中の列と分けて置く */
export const EXIT_STAGES: readonly string[] = ["応募辞退", "内定辞退", "内定取り消し", "書類NG", "面談NG", "選考NG"];

/** 企業の区分 (Company.companyKind) */
export const COMPANY_KINDS = ["通常", "人材紹介会社"] as const;
export const AGENCY_KIND = "人材紹介会社";
export const isAgencyKind = (kind: string | null | undefined) => kind === AGENCY_KIND;

const AGENCY_ONLY_STAGES = new Set(["入社待ち", "入社済み"]);

/** 企業の区分ごとのカンバンの列。通常の企業は 内定承諾 まで (その後は内定者管理)、人材紹介会社は 入社待ち・入社済み */
export function stagesForKind(kind: string | null | undefined): readonly string[] {
  return isAgencyKind(kind)
    ? CANDIDATE_STAGES.filter((s) => s !== "内定承諾")
    : CANDIDATE_STAGES.filter((s) => !AGENCY_ONLY_STAGES.has(s));
}

/** 選考が進む列 (左から順)。段階を飛ばして進めたときの日付埋めに使う */
export function progressStagesForKind(kind: string | null | undefined): readonly string[] {
  return isAgencyKind(kind)
    ? ["接続済み", "事前面談済み", "推薦済み", "面接済み", "内定済み", "入社待ち", "入社済み"]
    : ["接続済み", "事前面談済み", "推薦済み", "面接済み", "内定済み", "内定承諾"];
}

/** 通常の企業の、選考が進む列 */
export const ACTIVE_CANDIDATE_STAGES: readonly string[] = progressStagesForKind("通常");

/**
 * ステージに入れたときに聞く日付の名前 (カンバンで動かすと日付入力が出る)。
 * ここに無いステージは日付を聞かない (書類NG など)。
 */
export const STAGE_DATE_LABELS: Record<string, string> = {
  接続済み: "接続日",
  事前面談済み: "事前面談日",
  推薦済み: "推薦日",
  面接済み: "企業面接日",
  内定済み: "内定日",
  内定承諾: "内定承諾日",
  入社待ち: "入社予定日",
  入社済み: "入社日",
  応募辞退: "辞退の連絡日",
  内定辞退: "辞退日",
  内定取り消し: "取り消しの連絡日",
  選考NG: "NG の連絡日",
};

/** ステージごとの日付 (DealCandidate.stageDates) を安全に読む */
export function readStageDates(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) out[k] = v;
  }
  return out;
}

/**
 * 途中を飛ばして進めたときに自動で埋めた段階 (stageDates._filled)。
 * 件数には数えるが、日付は実際の日ではないので「かかった日数」の計算には使わない。
 */
export function readFilledStages(value: unknown): Set<string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return new Set();
  const f = (value as Record<string, unknown>)._filled;
  return new Set(Array.isArray(f) ? f.filter((x): x is string => typeof x === "string") : []);
}

/** 今日の日付 (日本時間) を "YYYY-MM-DD" で返す */
export function todayJst(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

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
  // 内定承諾 / 入社待ち / 入社済み は内定のあとの状態なので、人数カウンターは増やさない
  { stage: "内定承諾", counter: null },
  { stage: "入社待ち", counter: null },
  { stage: "入社済み", counter: null },
];

// 選考の流れから外れる列。入ったときに 1 増やし、戻したら 1 減らす
const EXIT_COUNTERS: Record<string, CounterField> = {
  内定辞退: "declineCount",
  // 人数カウンターの「選考NG」(旧: 不合格)
  選考NG: "rejectCount",
};

/**
 * 候補者をカンバンで動かしたときに、人数カウンターをいくつ増減するかを返す。
 *
 * - 先へ進めたら、通過した段階ぶん増やす (事前面談済み → 内定済み なら 推薦・面接・内定 が +1)
 * - 間違えて進めたものを戻したら、そのぶん減らす
 * - 内定辞退 / 選考NG は入ったら +1、出したら -1。それまでに数えた推薦・面接・内定はそのまま
 * - 書類NG / 面談NG / 応募辞退 / 内定取り消し は数えない
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
export const DEAL_STATUSES = ["至急募集", "募集中", "常時募集", "面接中", "成約", "一時中断", "ストップ"] as const;

// 過去に使っていた表記・スプシ側の表記 → 今の表記
const STATUS_ALIAS: Record<string, string> = {
  "！至急募集！": "至急募集",
  クローズ: "ストップ",
  停止: "ストップ",
  // 採用チームの表記ゆれ (2026/10 の改善依頼)
  応募集: "至急募集",
  常にお応募: "常時募集",
  常に応募: "常時募集",
  一旦ストップ: "一時中断",
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
