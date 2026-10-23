/**
 * 2026/10/23 に、二重登録されていた候補者を ID の大きいほうへまとめた記録。
 * 一時的な確認ページ (/duplicates) で担当者に見てもらうためのもの。確認が終われば消してよい。
 */

export type MergeRecord = {
  name: string;
  keptId: number;
  removed: { id: number; driveUrl: string; partnerId?: number }[];
  /** 消した ID から、残した ID に入れたもの・移したもの */
  moved: string[];
  /** 両方に値があって、残した ID の値を使ったもの (消した ID 側の値は残っていない) */
  kept: string[];
};

export const MERGE_RECORDS: MergeRecord[] = [
  {
    name: "NGUYEN THI HAI VAN",
    keptId: 296,
    removed: [{ id: 202, driveUrl: "https://drive.google.com/drive/folders/1HbI3XHKJbK-yZNy7fnbPmv75NDXlXAiD" }],
    moved: ["メールアドレス・電話番号", "志望動機・自己紹介・来日目的・今の仕事・転職理由", "高校の入学・卒業日", "職歴の入社日・退社日"],
    kept: [
      "生年月日: 296 は 2001/07/17、202 は 2001/07/16 (296 を使用。在留カードで確認してください)",
      "住所: 296 は大阪府大東市、202 は兵庫県神戸市 (296 を使用)",
      "在留期限: 296 は 2027/03/25、202 は 2027/07/24 (296 を使用)",
      "パートナー・写真・Drive フォルダは 296 のもの",
    ],
  },
  { name: "ALI MUHRODHI", keptId: 314, removed: [{ id: 256, driveUrl: "https://drive.google.com/drive/folders/1c_DxjATuiOY1EhoA3iCXC9J1EhkRsRpB" }, { id: 257, driveUrl: "https://drive.google.com/drive/folders/1M18fvAA4jFOg3ki6WSOCF92q0fJGB0ul" }], moved: [], kept: ["256・257 は名前だけの登録で、入れるものは無かった"] },
  { name: "RASYID ALSHAPID", keptId: 71, removed: [{ id: 31, driveUrl: "https://drive.google.com/drive/folders/1IOWv-f3O3-LFKkob45xMb80Ijtr4xiHS" }], moved: [], kept: [] },
  { name: "NGUYEN THI AN", keptId: 181, removed: [{ id: 63, driveUrl: "https://drive.google.com/drive/folders/1Q24zam7YyJT53pZAEi10l6mLl64ZRR1b" }], moved: ["日本語レベル (未取得)"], kept: ["カンバン: 同じ求人 (24sv) に 63 が「面談NG」、181 が「内定承諾」でいた。181 を残して 63 を外した", "181 は前から 0063 の Drive フォルダを使っていた"] },
  { name: "YUSFI KHOIRIL UMAM", keptId: 137, removed: [{ id: 101, driveUrl: "https://drive.google.com/drive/folders/14rqkh6hTiNXDdbd-7qCy2KzNbNGoqw59" }], moved: ["推薦先企業 (36sv_株式会社クリエ)・パートナー", "メールアドレス・電話番号", "配偶者・子供・備考", "職歴・志望動機・自己紹介・来日目的・今の仕事・転職理由", "その他資格の期限・高校"], kept: [] },
  { name: "ALPREY ARTHA DOPING", keptId: 413, removed: [{ id: 276, driveUrl: "https://drive.google.com/drive/folders/1R209uzi9fKuQX0GLx1xy8-f0_2ItsCbR" }], moved: [], kept: [] },
  { name: "SINGH ARJUN", keptId: 368, removed: [{ id: 74, driveUrl: "https://drive.google.com/drive/folders/1WcvJyZuFqB4hwgn9I6_Fe_-cDqm5XaV8", partnerId: 601 }], moved: ["カタカナ名 (368 は「51」になっていたので「シン アルジュン」に)", "写真・生年月日・住所", "履歴書の内容", "カンバン (58sv 推薦済み)"], kept: ["パートナー: 368 のものを使用 (74 は別のパートナーだった)"] },
  { name: "ARTIKA SARI DEVI", keptId: 432, removed: [{ id: 430, driveUrl: "https://drive.google.com/drive/folders/1-n8Mzby9qSnPP_GOzuC_c_WxSVdJrdnX" }], moved: [], kept: [] },
  { name: "NESSON RAFA ADITIYA", keptId: 185, removed: [{ id: 149, driveUrl: "https://drive.google.com/drive/folders/191bcr0D9jnUurXbQfnXW3QxCs46tnfVm" }], moved: [], kept: [] },
  { name: "ALVIN FERDIANTO", keptId: 145, removed: [{ id: 141, driveUrl: "https://drive.google.com/drive/folders/1E66tecI6A0UhKVA3RIP0XvrmV9Q4plZe" }], moved: [], kept: ["145 は前から 0141 の Drive フォルダを使っていた"] },
  { name: "MALDINI SAHPUTRA", keptId: 168, removed: [{ id: 163, driveUrl: "https://drive.google.com/drive/folders/1aNCvRDfZgWo-uQlp9GiNITjsc2iDsdYe" }], moved: [], kept: ["168 は前から 0163 の Drive フォルダを使っていた"] },
  { name: "UMINI", keptId: 50, removed: [{ id: 48, driveUrl: "https://drive.google.com/drive/folders/1YEDfiD_q45J94vMLVMAVLq4WT1TMxtkG" }], moved: [], kept: [] },
  { name: "MUHAMMAD ARMAN MAULANA", keptId: 183, removed: [{ id: 148, driveUrl: "https://drive.google.com/drive/folders/1Yt-YK0KPxBNPlYr43VCAYPx_Qi85p39l" }], moved: ["パートナー"], kept: ["183 は前から 0148 の Drive フォルダを使っていた"] },
  { name: "BISTA BIMAL", keptId: 354, removed: [{ id: 77, driveUrl: "https://drive.google.com/drive/folders/1euJYDz8blrOMjSN8DBD5BV2k0u9WeHBB", partnerId: 126 }], moved: ["カタカナ名 (354 は「21」になっていたので「ビスタ ビマル」に)", "写真・生年月日・住所・性別", "配偶者・子供・備考・職歴", "志望動機・自己紹介・来日目的・今の仕事・転職理由", "履歴書・日本語レベル・学校", "カンバン (58sv 推薦済み)"], kept: ["パートナー: 354 のものを使用 (77 は別のパートナーだった)"] },
  { name: "SITI ROHMAH", keptId: 51, removed: [{ id: 49, driveUrl: "https://drive.google.com/drive/folders/1_TumsdU2cw87EXWGCfJS23iDukvd6GXc" }], moved: [], kept: [] },
];

export const REVIEW_STATUSES = ["未確認", "問題なし", "別人 (戻してほしい)"] as const;
