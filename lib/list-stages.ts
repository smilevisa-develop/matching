/** 推薦リストに出す進捗 (2026-11-18 土田さん: カンバンの列のチェックで選ぶ)。未設定なら社内だけの不合格 (書類NG・面談NG) 以外ぜんぶ */
export const LIST_HIDDEN_DEFAULT = new Set(["書類NG", "面談NG"]);

export function readListStages(v: unknown): string[] | null {
  return Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : null;
}

export function stageOnList(stage: string, listStages: string[] | null): boolean {
  return listStages ? listStages.includes(stage) : !LIST_HIDDEN_DEFAULT.has(stage);
}
