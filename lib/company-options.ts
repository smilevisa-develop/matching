/**
 * 特定技能 16 分野 (2024 年改定版に準拠)。
 * 旧「素形材・産業機械・電気電子情報関連製造業」→「工業製品製造業」に統合。
 * 新設: 自動車運送業 / 鉄道 / 林業 / 木材産業 (旧 12 分野 + 4)。
 */
export const SSW_INDUSTRIES = [
  "介護",
  "ビルクリーニング",
  "工業製品製造業",
  "建設",
  "造船・舶用工業",
  "自動車整備",
  "航空",
  "宿泊",
  "農業",
  "漁業",
  "飲食料品製造業",
  "外食業",
  "自動車運送業",
  "鉄道",
  "林業",
  "木材産業",
] as const;

/**
 * 後方互換用: 旧名称 → 新名称 のマップ。
 * DB の Company.industry / Deal.field / Partner.introducibleFields に
 * 旧名称が残っている場合、UI 表示時に暗黙的に読み替える。
 */
export const SSW_INDUSTRY_ALIAS: Record<string, string> = {
  "素形材・産業機械・電気電子情報関連製造業": "工業製品製造業",
  "素形材・産業機械・電気電子": "工業製品製造業",
  "製造": "工業製品製造業",
};

/** 旧名称を新名称に正規化 (unknown はそのまま返す) */
export function normalizeSswIndustry(value: string | null | undefined): string | null {
  if (!value) return value ?? null;
  return SSW_INDUSTRY_ALIAS[value] ?? value;
}

// 企業追加時の採用状況。企業詳細の求人ステータスと同じ選択肢 (lib/deal-stages.ts)
export const HIRING_STATUSES = ["募集中", "至急募集", "常時募集", "面接中", "成約", "一時中断", "ストップ"] as const;

export type SswIndustry = (typeof SSW_INDUSTRIES)[number];
export type HiringStatus = (typeof HIRING_STATUSES)[number];

/** 企業の支援方法 (スプシ「企業マスタ」E列のプルダウンと同じ選択肢・表記) */
export const SUPPORT_METHODS = ["SMILEVISA", "SMILEVISA契約予定", "委託支援", "行書士依頼", "他支援", "自社支援"] as const;

export function normalizeSupportMethod(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return (SUPPORT_METHODS as readonly string[]).includes(s) ? s : null;
}
