/**
 * 請求の通しテスト用 (2026/11 土田さん)。on の間だけ:
 *   - 請求管理には personIds の人だけを出す (ほかの人は隠す。テスト企業の人も出す)
 *   - Slack はテスト用チャンネルに送り、メンションは付けない (本番チャンネルにノイズを出さない)
 * テストが終わったら on を false にして戻す。
 */
export const BILLING_TEST = {
  on: true,
  personIds: [1],
  channel: "C0CHGFFHR9A", // テスト-請求 (お客様)
  partnerChannel: "C0CGY4M5NTH", // テスト-請求pa (パートナー)
};
