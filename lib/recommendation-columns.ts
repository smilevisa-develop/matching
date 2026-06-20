/**
 * 推薦リストの出力カラム定義。
 *
 * - ID / 進捗 / 備考 は固定列 (常に出力。ユーザーは設定で変更不可)
 *   - ID: 候補者ID
 *   - 進捗: 応募/面接結果待ち/内定/辞退/不合格 (Sheets で dropdown 検証付き)
 *   - 備考: 自由記述列
 * - それ以外の列は CoreSettings.recommendationColumns で選択
 */

export type RecommendationColumnKey =
  | "addedAt"
  | "englishName"
  | "name"
  | "stage"
  | "gender"
  | "age"
  | "nationality"
  | "residenceStatus"
  | "address"
  | "birthDate"
  | "visaExpiryDate"
  | "sswYears"
  | "traineeExperience"
  | "japaneseLevel"
  | "japaneseLevelDate"
  | "licenseName"
  | "preferenceNote"
  | "phoneNumber"
  | "email"
  | "partner"
  | "resumeUrl"
  | "driveFolderUrl";

export type RecommendationColumnOption = {
  key: RecommendationColumnKey;
  label: string;
};

export const RECOMMENDATION_COLUMN_OPTIONS: RecommendationColumnOption[] = [
  { key: "addedAt", label: "追加日付" },
  { key: "englishName", label: "候補者名 (英語)" },
  { key: "name", label: "カタカナ名" },
  { key: "stage", label: "現在のステージ" },
  { key: "gender", label: "性別" },
  { key: "age", label: "年齢" },
  { key: "nationality", label: "国籍" },
  { key: "residenceStatus", label: "在留資格" },
  { key: "address", label: "現住所" },
  { key: "birthDate", label: "生年月日" },
  { key: "visaExpiryDate", label: "ビザ期限" },
  { key: "sswYears", label: "特定技能経過年数" },
  { key: "traineeExperience", label: "実習経験有無" },
  { key: "japaneseLevel", label: "日本語レベル" },
  { key: "japaneseLevelDate", label: "日本語検定取得日" },
  { key: "licenseName", label: "免許" },
  { key: "preferenceNote", label: "本人希望/希望手取り" },
  { key: "phoneNumber", label: "携帯番号" },
  { key: "email", label: "メール" },
  { key: "partner", label: "紹介パートナー" },
  { key: "resumeUrl", label: "履歴書 URL" },
  { key: "driveFolderUrl", label: "書類フォルダ URL" },
];

/**
 * デフォルトの推薦リスト出力列。
 * 「本人希望/希望手取り」「特定技能経過年数」は実運用で使われないので除外済 (2026-06-17)。
 */
export const DEFAULT_RECOMMENDATION_COLUMNS: RecommendationColumnKey[] = [
  "addedAt",
  "englishName",
  "name",
  "stage",
  "gender",
  "age",
  "nationality",
  "residenceStatus",
  "address",
  "birthDate",
  "visaExpiryDate",
  "traineeExperience",
  "japaneseLevel",
  "resumeUrl",
  "driveFolderUrl",
];

export function isRecommendationColumnKey(value: unknown): value is RecommendationColumnKey {
  return typeof value === "string" && RECOMMENDATION_COLUMN_OPTIONS.some((c) => c.key === value);
}

export function sanitizeRecommendationColumns(input: unknown): RecommendationColumnKey[] {
  if (!Array.isArray(input)) return DEFAULT_RECOMMENDATION_COLUMNS;
  const filtered = input.filter(isRecommendationColumnKey);
  return filtered.length > 0 ? filtered : DEFAULT_RECOMMENDATION_COLUMNS;
}

// 進捗列で許可される選択肢 (Sheets の data validation で使用)。
// 出力時はシステムのステージ (接続済み 等) を初期値で入れるため、
// それも dropdown に含めておく。受信企業が応募/内定 など別の値を選びたい時用に
// 後ろにも追加。strict: false にしているので任意の値も入力可。
export const RECOMMENDATION_PROGRESS_OPTIONS: string[] = [
  "接続済み",
  "事前面談済み",
  "推薦済み",
  "内定済み",
  "書類NG",
  "面談NG",
  "不合格",
  "応募",
  "面接結果待ち",
  "内定",
  "辞退",
];
