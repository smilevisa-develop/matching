/**
 * AI 面接練習の質問定義 (クライアント/サーバー共通、依存なし)。
 * lib/interview-practice.ts は @google/genai を import するため client に含めたくない。
 * 画面で使う選択肢と質問データだけはここに置き、両方から参照する。
 *
 * ── この質問集は「仮」──
 * 試作で精度を確かめるために、担当者の経験則ではなく一般的な面接質問で仮置きしている。
 * 本番では過去の面接動画を分析し、実際に聞かれた質問と深掘りの仕方に置き換える。
 * 置き換えるのは下の COMMON_OPENING / INDUSTRY_QUESTIONS / LAST_QUESTION だけでよい:
 *   text          … 面接官が読み上げる質問 (レベルごと)
 *   followupHints … その質問で深掘りするときの観点 (AI への指示になる)
 *
 * ── 1 回の面接の組み立て ──
 *   共通 3 問 → 分野別 3 問 → 最後の 1 問 (逆質問) = 主質問 7 問
 *   + AI が回答を聞いて入れる深掘り (最大 MAX_FOLLOWUPS 問) = 最大 10 問
 */

export const PRACTICE_LEVELS = ["N4", "N3", "N2"] as const;
export type PracticeLevel = (typeof PRACTICE_LEVELS)[number];

export function isPracticeLevel(v: unknown): v is PracticeLevel {
  return typeof v === "string" && (PRACTICE_LEVELS as readonly string[]).includes(v);
}

/** 画面に出すレベルの説明 */
export const PRACTICE_LEVEL_HINTS: Record<PracticeLevel, string> = {
  N4: "やさしい日本語で、ゆっくり / Easy Japanese, slowly",
  N3: "ふつうの日本語 / Everyday Japanese",
  N2: "実際の面接に近い日本語 / Close to a real interview",
};

export type PracticeIndustry = {
  key: string;
  /** 画面と記録に出す分野名 */
  label: string;
  en: string;
  /** 質問文に埋め込む言い方 (「{job}の仕事」の形で使う) */
  job: string;
};

/** 練習できる分野 (2026/10 の MTG で決めた 8 つ) */
export const PRACTICE_INDUSTRIES: PracticeIndustry[] = [
  { key: "food-service", label: "外食", en: "Food service", job: "飲食店" },
  { key: "care", label: "介護", en: "Nursing care", job: "介護" },
  { key: "food-manufacturing", label: "飲食料品製造", en: "Food manufacturing", job: "食品工場" },
  { key: "industrial-manufacturing", label: "工業製品製造", en: "Industrial manufacturing", job: "工場でのものづくり" },
  { key: "accommodation", label: "宿泊", en: "Hotel / accommodation", job: "ホテルや旅館" },
  { key: "agriculture", label: "農業", en: "Agriculture", job: "農業" },
  { key: "building-cleaning", label: "ビルクリーニング", en: "Building cleaning", job: "ビルの清掃" },
  { key: "auto-maintenance", label: "自動車整備", en: "Automobile maintenance", job: "自動車整備" },
];

export function findPracticeIndustry(key: unknown): PracticeIndustry | null {
  return PRACTICE_INDUSTRIES.find((i) => i.key === key) ?? null;
}

/** フィードバックを書く言語 */
export type PracticeFeedbackLanguage = {
  code: string;
  /** 管理画面・AI への指示に使う日本語名 */
  label: string;
  /** 候補者向けの表示 */
  native: string;
};

export const PRACTICE_FEEDBACK_LANGUAGES: PracticeFeedbackLanguage[] = [
  { code: "vi", label: "ベトナム語", native: "Tiếng Việt" },
  { code: "id", label: "インドネシア語", native: "Bahasa Indonesia" },
  { code: "my", label: "ミャンマー語", native: "မြန်မာ" },
  { code: "ne", label: "ネパール語", native: "नेपाली" },
  { code: "en", label: "英語", native: "English" },
  { code: "tl", label: "フィリピン語 (タガログ語)", native: "Tagalog" },
  { code: "th", label: "タイ語", native: "ไทย" },
  { code: "km", label: "クメール語", native: "ខ្មែរ" },
  { code: "zh", label: "中国語 (簡体字)", native: "中文" },
  { code: "mn", label: "モンゴル語", native: "Монгол" },
  { code: "si", label: "シンハラ語", native: "සිංහල" },
  { code: "bn", label: "ベンガル語", native: "বাংলা" },
  { code: "hi", label: "ヒンディー語", native: "हिन्दी" },
  { code: "ja", label: "やさしい日本語", native: "やさしい にほんご" },
];

export function findFeedbackLanguage(code: unknown): PracticeFeedbackLanguage | null {
  return PRACTICE_FEEDBACK_LANGUAGES.find((l) => l.code === code) ?? null;
}

/**
 * 国籍から、フィードバック言語の初期値を選ぶ (候補者は画面で変えられる)。
 * 当てはまらない国籍は英語にする。
 */
export function nationalityToFeedbackLanguage(nationality: string | null | undefined): string {
  const n = (nationality ?? "").trim();
  if (/ベトナム/.test(n)) return "vi";
  if (/インドネシア/.test(n)) return "id";
  if (/ミャンマー/.test(n)) return "my";
  if (/ネパール/.test(n)) return "ne";
  if (/タイ/.test(n)) return "th";
  if (/カンボジア/.test(n)) return "km";
  if (/中国/.test(n)) return "zh";
  if (/モンゴル/.test(n)) return "mn";
  if (/スリランカ/.test(n)) return "si";
  if (/バングラデシュ/.test(n)) return "bn";
  if (/インド/.test(n)) return "hi";
  return "en";
}

/** 深掘りは 1 回の面接でこの回数まで (主質問 7 + 深掘り 3 = 最大 10 問) */
export const MAX_FOLLOWUPS = 3;

type LeveledText = Record<PracticeLevel, string>;

export type PracticeQuestionDef = {
  key: string;
  /** 何を聞く質問か (記録・AI への指示用) */
  topic: string;
  /** レベルごとの質問文。{job} は分野の言い方に置き換わる */
  text: LeveledText;
  /** 深掘りするときの観点 */
  followupHints: string[];
  /** false なら深掘りしない */
  allowFollowup?: boolean;
};

/** レベルと分野が決まったあとの、1 問ぶんの質問 */
export type PlannedQuestion = {
  key: string;
  topic: string;
  text: string;
  followupHints: string[];
  allowFollowup: boolean;
};

const COMMON_OPENING: PracticeQuestionDef[] = [
  {
    key: "selfIntro",
    topic: "自己紹介",
    text: {
      N4: "まず、名前と 国を 教えてください。それから、少し 自己紹介を してください。",
      N3: "はじめに、簡単に自己紹介をお願いします。",
      N2: "それでは最初に、これまでのご経歴も含めて、1分程度で自己紹介をお願いできますか。",
    },
    followupHints: ["今の仕事や、これまでの仕事の内容", "日本語をどのくらい勉強しているか"],
  },
  {
    key: "whyJapan",
    topic: "日本で働きたい理由",
    text: {
      N4: "どうして 日本で 働きたいですか。",
      N3: "日本で働きたいと思った理由を教えてください。",
      N2: "数ある国の中で、なぜ日本で働こうと考えたのか、理由を聞かせていただけますか。",
    },
    followupHints: ["日本を選んだきっかけ", "日本でどのくらいの期間 働きたいか"],
  },
  {
    key: "whyIndustry",
    topic: "この分野を選んだ理由",
    text: {
      N4: "どうして {job}の 仕事を したいですか。",
      N3: "{job}の仕事を選んだ理由を教えてください。",
      N2: "{job}の仕事を志望された理由と、ご自身のどのような点が活かせるとお考えか教えてください。",
    },
    followupHints: ["その仕事に関係する経験があるか", "その仕事のどこに興味があるか"],
  },
];

const LAST_QUESTION: PracticeQuestionDef = {
  key: "candidateQuestions",
  topic: "逆質問",
  text: {
    N4: "さいごに、何か 質問は ありますか。",
    N3: "最後に、何か質問はありますか。",
    N2: "最後に、当社や仕事内容について何かご質問はありますか。",
  },
  followupHints: [],
  // 面接官が質問に答える場面は練習の対象外なので、ここでは深掘りしない
  allowFollowup: false,
};

const INDUSTRY_QUESTIONS: Record<string, PracticeQuestionDef[]> = {
  "food-service": [
    {
      key: "service",
      topic: "接客で気をつけること",
      text: {
        N4: "お客さんに 料理を 出すとき、何に 気をつけますか。",
        N3: "接客をするとき、どんなことに気をつけたいですか。",
        N2: "お客様に満足していただくために、接客でどのようなことを心がけたいとお考えですか。",
      },
      followupHints: ["具体的な場面や経験", "なぜそれが大切だと思うか"],
    },
    {
      key: "busy",
      topic: "忙しいときの動き方",
      text: {
        N4: "店が とても 忙しいとき、どうしますか。",
        N3: "お店がとても忙しいとき、どのように行動しますか。",
        N2: "ピークタイムで注文が重なったとき、どのように優先順位をつけて対応しますか。",
      },
      followupHints: ["周りの人とどう協力するか", "あわてたときにどうするか"],
    },
    {
      key: "hygiene",
      topic: "衛生",
      text: {
        N4: "料理を 作る前に、何を しますか。手や 服は どうしますか。",
        N3: "衛生管理のために、どんなことに気をつけますか。",
        N2: "食中毒などを防ぐために、衛生面で特に徹底すべきことは何だと思いますか。",
      },
      followupHints: ["毎日していること", "体調が悪いときにどうするか"],
    },
  ],
  care: [
    {
      key: "communication",
      topic: "利用者との接し方",
      text: {
        N4: "お年寄りと 話すとき、何に 気をつけますか。",
        N3: "利用者さんと接するとき、どんなことに気をつけたいですか。",
        N2: "利用者様の尊厳を守るために、介護の現場でどのような配慮が必要だとお考えですか。",
      },
      followupHints: ["具体的な場面や経験", "言葉が通じにくいときにどうするか"],
    },
    {
      key: "refusal",
      topic: "介助を嫌がられたとき",
      text: {
        N4: "お年寄りが「いやです」と 言ったら、どうしますか。",
        N3: "利用者さんが食事や入浴を嫌がったとき、どうしますか。",
        N2: "利用者様がケアを拒否された場合、どのように対応しますか。具体的に教えてください。",
      },
      followupHints: ["それでもうまくいかないときにどうするか", "誰に相談・報告するか"],
    },
    {
      key: "stamina",
      topic: "体力と夜勤",
      text: {
        N4: "体が 大変な 仕事です。夜の 仕事も あります。大丈夫ですか。",
        N3: "介護は体力が必要で、夜勤もあります。大丈夫ですか。",
        N2: "夜勤や体力的な負担がある仕事ですが、ご自身の体調管理についてどのように考えていますか。",
      },
      followupHints: ["体調を保つためにしていること", "これまでの夜勤やシフト勤務の経験"],
    },
  ],
  "food-manufacturing": [
    {
      key: "repetition",
      topic: "同じ作業を続けること",
      text: {
        N4: "同じ 仕事を 長い 時間 することは 大丈夫ですか。",
        N3: "同じ作業を長い時間続けることについて、どう思いますか。",
        N2: "ライン作業のように同じ工程を長時間続ける仕事で、集中力を保つためにどのような工夫をしますか。",
      },
      followupHints: ["似た仕事の経験", "集中が切れたときにどうするか"],
    },
    {
      key: "hygiene",
      topic: "衛生",
      text: {
        N4: "工場に 入る前に、何を しますか。",
        N3: "食品工場では衛生がとても大切です。どんなことに気をつけますか。",
        N2: "食品の安全を守るうえで、異物混入を防ぐために現場で徹底すべきことは何だと思いますか。",
      },
      followupHints: ["具体的な手順", "ルールを守らない人を見たらどうするか"],
    },
    {
      key: "mistake",
      topic: "ミスに気づいたとき",
      text: {
        N4: "仕事で まちがえたとき、どうしますか。",
        N3: "作業中にミスに気づいたとき、どうしますか。",
        N2: "作業中に不良品やミスに気づいた場合、どのように報告し、対応しますか。",
      },
      followupHints: ["誰に、いつ報告するか", "同じミスをしないためにすること"],
    },
  ],
  "industrial-manufacturing": [
    {
      key: "experience",
      topic: "ものづくりの経験",
      text: {
        N4: "工場で 働いたことが ありますか。どんな 仕事でしたか。",
        N3: "これまでに工場や機械を使う仕事の経験はありますか。",
        N2: "これまでのものづくりの経験と、そこで身につけた技術について具体的に教えてください。",
      },
      followupHints: ["使った機械や作ったもの", "その仕事で大変だったこと"],
    },
    {
      key: "safety",
      topic: "安全",
      text: {
        N4: "あぶない 仕事のとき、何に 気をつけますか。",
        N3: "安全に作業するために、どんなことに気をつけますか。",
        N2: "労働災害を防ぐために、作業前や作業中にどのような安全確認を行いますか。",
      },
      followupHints: ["具体的な場面や経験", "危ないと感じたときにどうするか"],
    },
    {
      key: "askForHelp",
      topic: "分からないときの確認",
      text: {
        N4: "わからないことが あるとき、どうしますか。",
        N3: "作業のやり方がわからないとき、どうしますか。",
        N2: "指示の内容が十分に理解できなかった場合、どのように確認を取りますか。",
      },
      followupHints: ["日本語で聞き返すときの言い方", "聞きにくいときにどうするか"],
    },
  ],
  accommodation: [
    {
      key: "welcome",
      topic: "お客様の迎え方",
      text: {
        N4: "ホテルの お客さんに 会ったとき、何と 言いますか。",
        N3: "お客様をお迎えするとき、どんなことに気をつけますか。",
        N2: "お客様に快適に過ごしていただくために、どのようなおもてなしを心がけたいですか。",
      },
      followupHints: ["具体的な場面や経験", "外国からのお客様への対応"],
    },
    {
      key: "complaint",
      topic: "クレーム対応",
      text: {
        N4: "お客さんが おこっているとき、どうしますか。",
        N3: "お客様からクレームを受けたとき、どうしますか。",
        N2: "お客様からご不満の声をいただいた場合、どのような手順で対応しますか。",
      },
      followupHints: ["自分で解決できないときにどうするか", "最初に言う言葉"],
    },
    {
      key: "shift",
      topic: "シフト勤務",
      text: {
        N4: "朝 早い 仕事や 夜の 仕事は できますか。",
        N3: "早朝や夜のシフト勤務はできますか。",
        N2: "シフト制で勤務時間が不規則になりますが、その点についてはどのようにお考えですか。",
      },
      followupHints: ["これまでのシフト勤務の経験", "生活のリズムをどう整えるか"],
    },
  ],
  agriculture: [
    {
      key: "experience",
      topic: "農業の経験",
      text: {
        N4: "農業の 仕事を したことが ありますか。",
        N3: "これまでに農業の経験はありますか。どんな作業をしましたか。",
        N2: "これまでの農業のご経験と、扱ってきた作物や作業内容について教えてください。",
      },
      followupHints: ["育てた作物と期間", "その仕事で大変だったこと"],
    },
    {
      key: "weather",
      topic: "屋外作業と体力",
      text: {
        N4: "暑い日や 寒い日も 外で 働きます。大丈夫ですか。",
        N3: "暑い日や寒い日も外で作業します。体力には自信がありますか。",
        N2: "天候に左右される屋外作業が中心ですが、体調管理はどのように行いますか。",
      },
      followupHints: ["体調を保つためにしていること", "体調が悪いときにどうするか"],
    },
    {
      key: "earlyMorning",
      topic: "早朝の作業",
      text: {
        N4: "朝 早く 起きることは できますか。",
        N3: "収穫の時期は朝がとても早いです。大丈夫ですか。",
        N2: "繁忙期には早朝からの作業や残業が増えますが、どのように取り組みますか。",
      },
      followupHints: ["ふだんの生活のリズム", "忙しい時期をどう乗り切るか"],
    },
  ],
  "building-cleaning": [
    {
      key: "experience",
      topic: "清掃の経験",
      text: {
        N4: "そうじの 仕事を したことが ありますか。",
        N3: "これまでに清掃の仕事の経験はありますか。",
        N2: "清掃業務のご経験と、使用したことのある機材や洗剤について教えてください。",
      },
      followupHints: ["どんな場所を清掃したか", "その仕事で大変だったこと"],
    },
    {
      key: "quality",
      topic: "清掃で気をつけること",
      text: {
        N4: "そうじを するとき、何に 気をつけますか。",
        N3: "きれいに清掃するために、どんなことに気をつけますか。",
        N2: "清掃の品質を保つために、作業のどのような点に注意を払いますか。",
      },
      followupHints: ["具体的な手順", "建物を使っている人が近くにいるときの配慮"],
    },
    {
      key: "alone",
      topic: "一人での作業",
      text: {
        N4: "一人で 仕事を することも あります。大丈夫ですか。",
        N3: "一人で作業することも多い仕事です。大丈夫ですか。",
        N2: "一人で現場を任されることもありますが、責任を持って仕事を進めるために何が大切だと思いますか。",
      },
      followupHints: ["困ったときに誰に連絡するか", "時間内に終わらないときにどうするか"],
    },
  ],
  "auto-maintenance": [
    {
      key: "experience",
      topic: "整備の経験",
      text: {
        N4: "車を 直す 仕事を したことが ありますか。",
        N3: "これまでに自動車整備の経験はありますか。どんな作業をしましたか。",
        N2: "これまでの整備経験と、得意とする作業内容について具体的に教えてください。",
      },
      followupHints: ["扱った車の種類や作業", "経験した年数"],
    },
    {
      key: "accuracy",
      topic: "整備で大切なこと",
      text: {
        N4: "車の 仕事で、何が 一番 大切だと 思いますか。",
        N3: "整備の仕事で一番大切なことは何だと思いますか。",
        N2: "整備不良は重大な事故につながります。作業の正確さを保つためにどのようなことを徹底しますか。",
      },
      followupHints: ["なぜそれが大切だと思うか", "確認のためにしていること"],
    },
    {
      key: "learning",
      topic: "新しい技術の勉強",
      text: {
        N4: "新しい ことを 勉強するのは 好きですか。",
        N3: "新しい技術や車の知識を、どのように勉強しますか。",
        N2: "電気自動車など技術の変化が速い分野ですが、新しい知識をどのように身につけていきますか。",
      },
      followupHints: ["最近勉強したこと", "日本語の専門用語をどう覚えるか"],
    },
  ],
};

function plan(def: PracticeQuestionDef, level: PracticeLevel, industry: PracticeIndustry): PlannedQuestion {
  return {
    key: def.key,
    topic: def.topic,
    text: def.text[level].replaceAll("{job}", industry.job),
    followupHints: def.followupHints,
    allowFollowup: def.allowFollowup !== false,
  };
}

/** レベルと分野から、1 回ぶんの主質問を順番に並べる */
export function buildQuestionPlan(level: PracticeLevel, industryKey: string): PlannedQuestion[] {
  const industry = findPracticeIndustry(industryKey);
  if (!industry) return [];
  const defs = [...COMMON_OPENING, ...(INDUSTRY_QUESTIONS[industry.key] ?? []), LAST_QUESTION];
  return defs.map((d) => plan(d, level, industry));
}

/** 1 回の面接で聞かれる質問数の上限 (進み具合の表示に使う) */
export function maxQuestionCount(level: PracticeLevel, industryKey: string): number {
  return buildQuestionPlan(level, industryKey).length + MAX_FOLLOWUPS;
}

/** 面接の最初に、1 問目の前に言うあいさつ */
export const OPENING_LINE: LeveledText = {
  N4: "こんにちは。今日は 面接の 練習を します。よろしく お願いします。",
  N3: "こんにちは。今日は面接の練習をします。よろしくお願いします。",
  N2: "こんにちは。本日は面接の練習を行います。どうぞよろしくお願いいたします。",
};

/** 面接の最後に言うあいさつ */
export const CLOSING_LINE: LeveledText = {
  N4: "ありがとうございました。面接は これで 終わりです。お疲れさまでした。",
  N3: "ありがとうございました。面接は以上です。お疲れさまでした。",
  N2: "ありがとうございました。本日の面接は以上となります。お疲れさまでした。",
};

/** 回答が聞き取れなかったときの聞き返し (同じ質問で 1 回だけ) */
export const RETRY_LINE: LeveledText = {
  N4: "すみません、よく 聞こえませんでした。もう一度 お願いします。",
  N3: "すみません、よく聞こえませんでした。もう一度お願いします。",
  N2: "申し訳ありません、少し聞き取りにくかったので、もう一度お願いできますか。",
};

/**
 * 回答を聞いたあとの相づち。AI にはこの中から選ばせる。
 * 自由に書かせると「頼もしいですね」のような評価が混じるのと、
 * 決まった文にしておけば音声を作り置きできるため。先頭が既定。
 */
export const ACKNOWLEDGEMENTS = ["ありがとうございます。", "わかりました。", "そうですか。", "そうなんですね。"];

/** 質問集にある決まった文の一覧 (音声を作り置きしてよい文かどうかの判定に使う) */
export function allFixedLines(): string[] {
  const lines = new Set<string>(ACKNOWLEDGEMENTS);
  for (const level of PRACTICE_LEVELS) {
    lines.add(OPENING_LINE[level]);
    lines.add(CLOSING_LINE[level]);
    lines.add(RETRY_LINE[level]);
    for (const industry of PRACTICE_INDUSTRIES) {
      for (const q of buildQuestionPlan(level, industry.key)) lines.add(q.text);
    }
  }
  return [...lines];
}

/**
 * 読み上げの速さ。
 *   device … AI の音声が使えないときの、端末の音声合成の rate
 *   ai     … AI の音声の再生速度 (もとが自然な速さなので、やさしいレベルだけ少し落とす)
 */
export const SPEECH_RATE: Record<PracticeLevel, { device: number; ai: number }> = {
  N4: { device: 0.8, ai: 0.85 },
  N3: { device: 0.95, ai: 1 },
  N2: { device: 1.05, ai: 1 },
};

/** 1 回の回答で録音できる長さの上限 (秒) */
export const ANSWER_MAX_SECONDS = 90;
