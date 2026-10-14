/**
 * 企業 (Deal) の募集状況と、候補者の進捗ステージの定義。
 * 企業詳細のカンバンと進捗管理の両方で同じものを使う。
 */

/** 候補者の進捗ステージ (企業詳細のカンバンの列) */
export const CANDIDATE_STAGES = [
  "接続済み",
  "事前面談済み",
  "推薦済み",
  "内定済み",
  "書類NG",
  "面談NG",
  "不合格",
] as const;

// Deal.status にはスプシ側の表記 (「！至急募集！」「ストップ」「一時中断」など) も入っている
const URGENT_STATUSES = ["至急募集", "！至急募集！"];
const STOPPED_STATUSES = ["成約", "クローズ", "ストップ", "一時中断", "失注"];

export type DealGroup = "urgent" | "open" | "stopped";

export function dealGroup(status: string): DealGroup {
  const s = status.trim();
  if (URGENT_STATUSES.includes(s)) return "urgent";
  if (STOPPED_STATUSES.includes(s)) return "stopped";
  return "open";
}
