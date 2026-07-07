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

export const HIRING_STATUSES = ["募集中", "至急募集", "面接中", "成約", "停止"] as const;

export type SswIndustry = (typeof SSW_INDUSTRIES)[number];
export type HiringStatus = (typeof HIRING_STATUSES)[number];
