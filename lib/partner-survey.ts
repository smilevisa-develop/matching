/**
 * パートナーアンケート (2026/11)。
 *
 * 一斉連絡の本文に {{アンケートURL}} を書くと、パートナーごとのリンク (/partner-survey/[token]) に置き換わる。
 * 回答はそのままパートナー情報 (紹介可能・手数料・特徴・連絡先) に入り、
 * 列が無い項目 (今すぐ紹介できる人数・日本語レベル・提示までの日数・連絡の言語) は Partner.surveyAnswers に入る。
 * 案件の段階配信 (優先度の高いパートナーから順に案内する) の材料にする。
 * サーバーだけで使うもの (リンクの発行) は lib/partner-survey-server.ts
 */

/** 列が無い回答の選択肢。value は保存値 (日本語)、en はフォームの英語表示 */
export const SURVEY_CHOICES = {
  poolSize: {
    label: "今すぐ紹介できる候補者の人数",
    en: "How many candidates can you introduce right now?",
    options: [
      { value: "0人", en: "None" },
      { value: "1〜5人", en: "1-5" },
      { value: "6〜20人", en: "6-20" },
      { value: "21人以上", en: "21 or more" },
    ],
    multiple: false,
  },
  japaneseLevels: {
    label: "候補者の日本語レベル (多いもの)",
    en: "Japanese level of your candidates (most common)",
    options: [
      { value: "N5以下", en: "N5 or below" },
      { value: "N4", en: "N4" },
      { value: "N3", en: "N3" },
      { value: "N2以上", en: "N2 or above" },
    ],
    multiple: true,
  },
  responseDays: {
    label: "求人をもらってから候補者を出せるまで",
    en: "How soon can you present candidates after receiving a job?",
    options: [
      { value: "3日以内", en: "Within 3 days" },
      { value: "1週間", en: "About 1 week" },
      { value: "2週間以上", en: "2 weeks or more" },
    ],
    multiple: false,
  },
  language: {
    label: "連絡に使う言語",
    en: "Language for communication",
    options: [
      { value: "日本語", en: "Japanese" },
      { value: "英語", en: "English" },
      { value: "その他", en: "Other" },
    ],
    multiple: false,
  },
} as const;

export type SurveyChoiceKey = keyof typeof SURVEY_CHOICES;
/** 列が無い回答の形 (Partner.surveyAnswers) */
export type SurveyAnswers = Partial<Record<SurveyChoiceKey, string[]>>;

/** Partner.surveyAnswers (Json) を安全に読む */
export function readSurveyAnswers(value: unknown): SurveyAnswers {
  if (!value || typeof value !== "object") return {};
  const out: SurveyAnswers = {};
  for (const key of Object.keys(SURVEY_CHOICES) as SurveyChoiceKey[]) {
    const raw = (value as Record<string, unknown>)[key];
    const allowed = SURVEY_CHOICES[key].options.map((o) => o.value as string);
    const list = (Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : []).filter(
      (v): v is string => typeof v === "string" && allowed.includes(v),
    );
    if (list.length > 0) out[key] = list;
  }
  return out;
}

/** 一斉連絡の変数名。本文にこれがあるときだけリンクを作る */
export const SURVEY_URL_VARIABLE = "アンケートURL";

/**
 * チャット (LINE / Messenger) に入れる依頼文の既定。一斉連絡の「お知らせ」の型 (会社名・担当者名・送信者の挨拶と結び) の中に入る。
 * {{アンケートURL}} は送るときにパートナーごとのリンクになる
 */
export const SURVEY_REQUEST_TEXT = [
  "日頃よりご協力いただき、誠にありがとうございます。",
  "ご紹介いただける人材の最新の状況を確認させていただきたく、アンケートへのご協力をお願いいたします。",
  "所要時間は約3分です。ご回答の内容は、今後の求人のご案内に活用いたします。",
  "",
  "▼ご回答はこちら",
  "{{アンケートURL}}",
  "",
  "Thank you for your continued support. We would appreciate it if you could update the status of the candidates you can introduce (about 3 minutes). Your answers will help us send you job offers that fit your candidates.",
].join("\n");

/** メールの件名の既定 */
export const SURVEY_EMAIL_SUBJECT = "【株式会社CROSLAN】ご紹介いただける人材に関するアンケートのお願い（約3分）";

/** メールの本文の既定 (挨拶と署名まで入った完全な文面)。{{送信者}} は送る人の姓 */
export const SURVEY_EMAIL_TEXT = [
  "{{パートナー名}}",
  "{{担当者名}} 様",
  "",
  "いつも大変お世話になっております。",
  "株式会社CROSLAN 人材事業部の{{送信者}}です。",
  "",
  "日頃よりご協力いただき、誠にありがとうございます。",
  "このたび、各パートナー様にご紹介いただける人材の最新の状況を把握し、より条件に合った求人をご案内できるよう、アンケートを実施しております。",
  "",
  "お手数をおかけしますが、下記のリンクよりご回答いただけますと幸いです。",
  "所要時間は約3分です。ご回答いただいた内容は、貴社の登録情報にそのまま反映されます。",
  "",
  "▼アンケートのご回答はこちら",
  "{{アンケートURL}}",
  "",
  "ご不明な点がございましたら、このメールへの返信にてお気軽にお問い合わせください。",
  "引き続きよろしくお願いいたします。",
  "",
  "---",
  "Dear {{担当者名}},",
  "",
  "Thank you for your continued partnership. To send you job offers that better fit your candidates, we kindly ask you to complete a short survey (about 3 minutes). Your answers will be reflected in your partner profile with us.",
  "",
  "Survey: {{アンケートURL}}",
  "",
  "If you have any questions, please reply to this email.",
  "",
  "---",
  "株式会社CROSLAN 人材事業部　{{送信者}}",
  "Email: recruit@croslan.co.jp",
].join("\n");
