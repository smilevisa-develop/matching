/**
 * 請求の通しテスト用 (2026/11 土田さん)。on の間だけ:
 *   - 請求管理には personIds の人だけを出す (ほかの人は隠す。テスト企業の人も出す)
 *   - slackToTestChannels が true のときだけ、Slack をテスト用チャンネルに送りメンションを付けない
 *     (false なら Slack は本番と同じ。2026/11 土田さん「通しで見せたいので本番と同じに」)
 * テストが終わったら on を false にして戻す。
 */
export const BILLING_TEST = {
  on: false,
  personIds: [1],
  slackToTestChannels: false,
  channel: "C0CHGFFHR9A", // テスト-請求 (お客様)
  partnerChannel: "C0CGY4M5NTH", // テスト-請求pa (パートナー)
};
