/**
 * パートナーアンケート (2026/11)。
 *
 * 一斉連絡の本文に {{アンケートURL}} を書くと、パートナーごとのリンク (/partner-survey/[token]) に置き換わる。
 * 回答はまず Partner.surveyResponse にそのまま入り、相手が入れた会社名が登録名と合えばすぐパートナー情報
 * (紹介可能・手数料・特徴) に反映する。合わなければ「確認待ち」にして、管理者が /partners/survey で反映する
 * (LINE グループが別の会社に紐づいていたときに、間違った会社の情報を上書きしないため)。
 * 列が無い項目 (会社の所在地・候補者の多い場所) は Partner.surveyAnswers に入る。
 * サーバーだけで使うもの (リンクの発行・反映) は lib/partner-survey-server.ts
 */

/** 列が無い回答の選択肢。value は保存値 (日本語)、en はフォームの英語表示 */
export const SURVEY_CHOICES = {
  companyLocation: {
    label: "会社の所在地",
    en: "Where is your company located?",
    options: [
      { value: "日本", en: "Japan" },
      { value: "海外", en: "Overseas" },
    ],
    multiple: false,
  },
  candidateLocation: {
    label: "候補者が多いのはどちらか",
    en: "Where are most of your candidates?",
    options: [
      { value: "日本国内が多い", en: "Mostly in Japan" },
      { value: "海外が多い", en: "Mostly overseas" },
      { value: "同じくらい", en: "About the same" },
    ],
    multiple: false,
  },
} as const;

export type SurveyChoiceKey = keyof typeof SURVEY_CHOICES;
/** 列が無い回答の形 (Partner.surveyAnswers) */
export type SurveyAnswers = Partial<Record<SurveyChoiceKey, string[]>>;

/** 候補者の多い場所 → 紹介可能の「国内 / 国外 / 両方」 */
export const CANDIDATE_LOCATION_TO_SCOPE: Record<string, "国内" | "国外" | "両方"> = {
  日本国内が多い: "国内",
  海外が多い: "国外",
  同じくらい: "両方",
};

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

/** フォームから届く回答そのもの (Partner.surveyResponse にこの形で入る) */
export type SurveyResponse = {
  /** 相手が入れた会社名 (登録名と合うかの確認に使う) */
  companyName: string;
  contactName: string;
  answers: SurveyAnswers;
  introducibleNationalities: string[];
  introducibleFields: string[];
  introducibleResidenceStatuses: string[];
  feeAmount: string;
  minFeeAmount: string;
  features: string;
};

/** Partner.surveyResponse (Json) を安全に読む */
export function readSurveyResponse(value: unknown): SurveyResponse | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const str = (x: unknown) => (typeof x === "string" ? x : "");
  const list = (x: unknown) => (Array.isArray(x) ? x.filter((y): y is string => typeof y === "string") : []);
  if (!str(v.companyName)) return null;
  return {
    companyName: str(v.companyName),
    contactName: str(v.contactName),
    answers: readSurveyAnswers(v.answers),
    introducibleNationalities: list(v.introducibleNationalities),
    introducibleFields: list(v.introducibleFields),
    introducibleResidenceStatuses: list(v.introducibleResidenceStatuses),
    feeAmount: str(v.feeAmount),
    minFeeAmount: str(v.minFeeAmount),
    features: str(v.features),
  };
}

/** 会社名の比べ方: 全角→半角、小文字、空白と記号、「株式会社」「Co., Ltd.」などの法人格を除く */
export function normalizeCompanyName(name: string): string {
  return name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/株式会社|有限会社|合同会社|合資会社|一般社団法人|社会福祉法人|学校法人|\(株\)|\(有\)|㈱|㈲/g, "")
    .replace(/\b(co\.?,?\s*ltd\.?|ltd\.?|inc\.?|corp\.?|corporation|company|limited|llc|pte\.?|pt\.?|cv\.?|jsc|co\.?)\b/g, "")
    .replace(/[\s　,.、。・･\-–—_()（）\[\]「」『』'"’”&＆/／]/g, "");
}

/** 相手が入れた会社名が登録名と同じ会社とみなせるか (片方がもう片方を含めば同じ) */
export function companyNameMatches(typed: string, registered: string): boolean {
  const a = normalizeCompanyName(typed);
  const b = normalizeCompanyName(registered);
  if (a.length < 2 || b.length < 2) return false;
  return a === b || a.includes(b) || b.includes(a);
}

/** 一斉連絡の変数名。本文にこれがあるときだけリンクを作る */
export const SURVEY_URL_VARIABLE = "アンケートURL";

/**
 * チャット (LINE / Messenger) に入れる依頼文の既定。一斉連絡の「お知らせ」の型 (会社名・担当者名・送信者の挨拶と結び) の中に入る。
 * {{アンケートURL}} は送るときにパートナーごとのリンクになる
 */
export const SURVEY_REQUEST_TEXT = [
  "日頃よりご協力いただき、誠にありがとうございます。",
  "",
  "ご紹介いただける人材の最新の状況を確認させていただきたく、アンケートへのご協力をお願いいたします。",
  "所要時間は約3分です。ご回答の内容は、今後の求人のご案内に活用いたします。",
  "",
  "▼ご回答はこちら",
  "{{アンケートURL}}",
  "",
  "※今後もお取引を継続させていただくため、お手数ですが必ずご回答をお願いいたします。",
  "",
  "Thank you for your continued support. We would appreciate it if you could update the status of the candidates you can introduce (about 3 minutes). Your answers will help us send you job offers that fit your candidates. Please be sure to reply so that we can continue working together.",
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
