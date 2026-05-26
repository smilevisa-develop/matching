/**
 * パートナー (アライアンス先) の選択リスト定義。
 *
 * 紹介可能な国籍 / 分野 / 在留資格 は UI 上はチェックボックスで複数選択し、
 * DB には CSV (例: "ベトナム,インドネシア") として保存する。
 */

export const PARTNER_ROLES = [
  "求人",
  "求職",
  "求人・求職",
  "学校",
  "送り出し機関",
  "その他",
] as const;
export type PartnerRole = (typeof PARTNER_ROLES)[number];

/** 関係性 (品質ラベル) — 単一選択ドロップダウン */
export const RELATIONSHIP_STATUSES = [
  "実績有り",
  "実績無し",
  "優良",
  "通常",
] as const;
export type RelationshipStatus = (typeof RELATIONSHIP_STATUSES)[number];

export const INTRODUCIBLE_NATIONALITIES = [
  "ベトナム",
  "インドネシア",
  "ミャンマー",
  "フィリピン",
  "タイ",
  "ネパール",
  "中国",
  "スリランカ",
  "カンボジア",
  "バングラデシュ",
  "インド",
  "モンゴル",
  "韓国",
] as const;

export const INTRODUCIBLE_SCOPES = ["国内", "国外", "両方"] as const;
export type IntroducibleScope = (typeof INTRODUCIBLE_SCOPES)[number];

export const INTRODUCIBLE_FIELDS = [
  "介護",
  "外食",
  "建設",
  "製造",
  "宿泊",
  "農業",
  "漁業",
  "ビルクリーニング",
  "自動車整備",
  "航空",
  "造船・舶用",
  "素形材・産業機械・電気電子",
  "IT・通信",
  "事務職",
  "その他",
] as const;

export const INTRODUCIBLE_RESIDENCE_STATUSES = [
  "技能実習",
  "特定技能1号",
  "特定技能2号",
  "技術・人文知識・国際業務",
  "留学生",
  "特定活動",
] as const;

// --- CSV ↔ 配列 変換ヘルパー ---

export function parseCsv(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function toCsv(values: string[] | null | undefined): string | null {
  if (!values || values.length === 0) return null;
  const cleaned = [...new Set(values.map((v) => v.trim()).filter(Boolean))];
  return cleaned.length > 0 ? cleaned.join(",") : null;
}
