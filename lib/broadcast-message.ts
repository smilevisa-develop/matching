/**
 * パートナー一斉連絡の文面ルール (クライアント / サーバー共通、依存なし)。
 *
 * ── 全チャネルの文面を WhatsApp 承認テンプレに揃える ──
 * WhatsApp は Meta が承認したテンプレートでしか (24 時間枠の外へ) 送れない。
 * そこで「求人情報」も「お知らせ (自由メッセージ)」も、承認テンプレの本文を型にして
 * LINE / Messenger / メール にも同じ文面を送る。
 *
 * ── WhatsApp だけの制約 ──
 *   - テンプレの変数 ({{n}}) に改行・タブ・5 連続スペースを入れられない
 *     → 複数行の入力は WhatsApp 送信時だけ「 ／ 」でつないで 1 行にする (flattenForWhatsapp)
 *   - 承認テンプレに無い項目は独立した見出しにできない
 *     → 紹介料の枠を持つテンプレが承認されるまでは「内容」の末尾に入れる
 *   - テンプレ以外 (自由文) は相手が 24 時間以内に送ってきた場合しか届かず、
 *     しかも届かなくても API は成功を返す → 自由文では絶対に送らない
 */

/** 求人情報テンプレの名前 (例: partner_job_offer_v15)。末尾の番号が大きいほど新しい */
export const JOB_TEMPLATE_PATTERN = /^partner_job_offer_v(\d+)$/;
/** お知らせ (自由メッセージ) テンプレの名前 (例: partner_job_offer_notice_v1) */
export const NOTICE_TEMPLATE_PATTERN = /^partner_job_offer_notice_v(\d+)$/;

/**
 * お知らせ (自由メッセージ) の型。{{1}} 会社名 / {{2}} 担当者名 / {{3}} 送信者の姓 / {{4}} 本文。
 * 求人情報テンプレと同じ書き出し・結びにしてある。
 * お知らせテンプレが Meta に承認されていればその本文を優先して使う (これは申請内容と同じ)。
 */
export const NOTICE_FRAME =
  "【お知らせ】\n\n{{1}}\n{{2}}様\n\nお世話になっております。株式会社CROSLANの{{3}}です。\n\n{{4}}\n\nご不明な点がございましたら、お気軽にご連絡いただけますと幸いです。";

/** 紹介料の見出し (テンプレの見出しと、内容に入れるときの見出しを揃える) */
export const REFERRAL_FEE_LABEL = "紹介料";

/** チャネルごとの 1 通あたりの文字数上限 (超えると送信エラーになる) */
export const CHANNEL_TEXT_LIMITS = {
  Messenger: 2000,
  LINE: 5000,
} as const;

/**
 * WhatsApp テンプレの変数に入れる値へ変換する。
 * 改行は使えないため、行を「 ／ 」でつなぐ。空行は捨てる。
 */
export function flattenForWhatsapp(value: string): string {
  return value
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" ／ ");
}

/**
 * Meta に申請するテンプレート (管理用エンドポイントから申請する。内容はここで固定)。
 * 例文 (examples) は審査用。{{n}} の順に並べる。
 */
export const TEMPLATE_DRAFTS = {
  /** 求人情報: v15 に「■紹介料」を追加した版 */
  partner_job_offer_v16: {
    category: "UTILITY",
    body:
      "【お知らせ】\n\n{{1}}\n{{2}}様\n\nお世話になっております。株式会社CROSLANの{{3}}です。\n案件情報をお知らせします。\n\n" +
      "■職種\n{{4}}\n\n■勤務地\n{{5}}\n\n■人数\n{{6}}名\n\n■対象\n・{{7}}\n・{{8}}\n\n■条件\n・{{9}}\n\n" +
      "■内容\n{{10}}\n\n■紹介料\n{{11}}\n\n■詳細\n{{12}}\n\n" +
      "ご不明な点がございましたら、お気軽にご連絡いただけますと幸いです。",
    examples: [
      "株式会社グローバルワーク",
      "田中",
      "土田",
      "介護",
      "東京都新宿区",
      "3",
      "特定技能1号",
      "ベトナム・インドネシア・ミャンマー",
      "介護技能評価試験および日本語試験の合格者",
      "高齢者施設での食事・入浴・排泄などの身体介護および生活支援全般",
      "1名あたり10万円（税別）",
      "https://docs.google.com/spreadsheets/d/example123",
    ],
  },
  /** お知らせ (自由メッセージ) */
  partner_job_offer_notice_v1: {
    category: "UTILITY",
    body: NOTICE_FRAME,
    examples: [
      "株式会社グローバルワーク",
      "田中",
      "土田",
      "年末年始の営業日についてお知らせします。12月28日から1月4日までお休みをいただきます。",
    ],
  },
} as const;

export type TemplateDraftName = keyof typeof TEMPLATE_DRAFTS;
