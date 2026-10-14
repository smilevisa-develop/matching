/**
 * テスト用の企業 (企業ID)。画面には出すが、進捗管理や売上ダッシュボードの集計には含めない。
 */
export const TEST_COMPANY_EXTERNAL_IDS = ["00sv"]; // 株式会社お寿司

export function isTestCompany(externalId: string | null | undefined): boolean {
  return TEST_COMPANY_EXTERNAL_IDS.includes((externalId ?? "").trim().toLowerCase());
}
