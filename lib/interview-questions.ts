/**
 * 面接前ヒアリング (事前質問) の定義。
 *
 * - 既存 ResumeProfile カラム (motivation / selfIntroduction / japanPurpose /
 *   currentJob / retirementReason) に紐づく質問は existingField を指定する。
 *   これらは履歴書テンプレの placeholder ({{志望動機}} 等) に直接反映される。
 * - それ以外の質問は jsonKey を指定し、ResumeProfile.interviewAnswers Json に
 *   { jsonKey: answer } 形式で保存する。
 */

/**
 * 質問の優先度。
 *   must     … 企業への推薦可否・案件マッチングに直結する。フォームで最初に出す。
 *   optional … あると嬉しいが、面接で聞けば足りる。「もっと詳しく」で開く。
 * 未指定は optional 扱い。
 */
export type QuestionPriority = "must" | "optional";

/** 候補者の居住地 (分岐に使う) */
export type CandidateLocation = "domestic" | "overseas";

/**
 * 質問の表示条件。指定した条件を すべて 満たすときだけ表示する。
 * 未指定 (showIf なし) の質問は常に表示。
 */
export type QuestionCondition = {
  /** 在留資格がこのいずれかのときだけ表示 */
  residenceStatusIn?: string[];
  /** 在留資格がこのいずれかのときは非表示 */
  residenceStatusNotIn?: string[];
  /** 居住地がこのいずれかのときだけ表示 */
  locationIn?: CandidateLocation[];
};

export type InterviewQuestion = {
  /** UI のフォーム key (一意) */
  key: string;
  /** 質問文 */
  question: string;
  /** 補足/プレースホルダ (候補者にも表示される) */
  hint?: string;
  /** 入力タイプ */
  type?: "text" | "textarea" | "select";
  /** select 用の選択肢 */
  options?: string[];
  /** 優先度 (未指定は optional) */
  priority?: QuestionPriority;
  /** 表示条件 (未指定は常に表示) */
  showIf?: QuestionCondition;
  /** 既存 ResumeProfile カラムへ書き込む場合のフィールド名 */
  existingField?:
    | "motivation"
    | "selfIntroduction"
    | "japanPurpose"
    | "currentJob"
    | "retirementReason";
  /** interviewAnswers Json に書き込む場合の key */
  jsonKey?: string;
};

export type InterviewSection = {
  title: string;
  description?: string;
  questions: InterviewQuestion[];
};

/** 分岐判定に使う候補者の状況 */
export type QuestionContext = {
  residenceStatus?: string | null;
  location?: CandidateLocation | null;
};

/**
 * 分岐条件を評価して、この質問を表示すべきか返す。
 * 判定に必要な情報がまだ無い (residenceStatus / location が null) 場合は
 * 「隠さない」= true を返す。誤って必要な質問を落とすより、余分に見せる方が安全。
 */
export function isQuestionVisible(q: InterviewQuestion, ctx: QuestionContext): boolean {
  const cond = q.showIf;
  if (!cond) return true;

  const status = ctx.residenceStatus?.trim();
  if (cond.residenceStatusIn && status) {
    if (!cond.residenceStatusIn.includes(status)) return false;
  }
  if (cond.residenceStatusNotIn && status) {
    if (cond.residenceStatusNotIn.includes(status)) return false;
  }
  if (cond.locationIn && ctx.location) {
    if (!cond.locationIn.includes(ctx.location)) return false;
  }
  return true;
}

/** 「今どこに住んでいますか」の回答文字列 → CandidateLocation */
export function parseLocationAnswer(value: string | null | undefined): CandidateLocation | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  if (v === "海外" || /overseas|abroad/i.test(v)) return "overseas";
  if (v === "日本" || /japan/i.test(v)) return "domestic";
  return null;
}

/** 居住地を尋ねるゲート質問の key (分岐のドライバ) */
export const LOCATION_QUESTION_KEY = "currentLocation";

export const INTERVIEW_SECTIONS: InterviewSection[] = [
  {
    title: "はじめに",
    description: "最初に 1 つだけ教えてください。この回答で、あとの質問が少し変わります。",
    questions: [
      {
        key: LOCATION_QUESTION_KEY,
        question: "今どこにお住まいですか。 / Where do you live now?",
        type: "select",
        options: ["日本", "海外"],
        jsonKey: LOCATION_QUESTION_KEY,
        priority: "must",
      },
    ],
  },
  {
    title: "日本に来た目的",
    questions: [
      {
        key: "japanPurpose",
        question: "日本に来た（来る）目的を教えてください。",
        type: "textarea",
        existingField: "japanPurpose",
        priority: "must",
        hint: "例：家族のためにお金を稼ぎたい。日本の技術を学びたい。",
      },
      {
        key: "japanArrivalDate",
        question: "いつ日本へ来ましたか。（海外の方は、いつ来る予定ですか。）",
        type: "text",
        jsonKey: "japanArrivalDate",
        hint: "例：2023年4月 ／ 2026年8月ごろ予定",
      },
    ],
  },
  {
    title: "分野の経験・仕事内容・今の給料",
    questions: [
      {
        key: "currentJob",
        question: "今のお仕事の内容を教えてください。",
        type: "textarea",
        existingField: "currentJob",
        priority: "must",
        hint: "例：工場でお弁当を作る仕事をしています。",
      },
      {
        key: "sameJobExperience",
        question: "応募する分野での経験は、どのくらいありますか。",
        type: "textarea",
        jsonKey: "sameJobExperience",
        priority: "must",
        hint: "例：介護の仕事を3年しました。／ 経験はありません。",
      },
      {
        key: "currentTakeHome",
        question: "今の給料（手取り）はいくらですか。",
        type: "text",
        jsonKey: "currentTakeHome",
        priority: "must",
        hint: "例：月 18万円くらい",
      },
      {
        key: "currentSalary",
        question: "今の給料（額面）はいくらですか。",
        type: "text",
        jsonKey: "currentSalary",
        hint: "例：月 22万円",
      },
      {
        key: "currentOvertimeHours",
        question: "毎月、どのくらい残業していますか。",
        type: "text",
        jsonKey: "currentOvertimeHours",
        hint: "例：月 20時間くらい",
      },
      {
        key: "workChallenge",
        question: "仕事で大変だったことと、その解決方法を教えてください。",
        type: "textarea",
        jsonKey: "workChallenge",
        hint: "例：納期が厳しい時、手順を工夫して間に合わせました。",
      },
      {
        key: "teamworkExperience",
        question: "チームで働いた経験を教えてください。",
        type: "textarea",
        jsonKey: "teamworkExperience",
        hint: "例：5人のチームで協力して目標を達成しました。",
      },
      {
        key: "physicalConfidence",
        question: "体力に自信はありますか。",
        type: "select",
        options: ["はい", "いいえ"],
        jsonKey: "physicalConfidence",
      },
      {
        key: "overtimeAcceptable",
        question: "残業やシフト勤務はできますか。",
        type: "select",
        options: ["はい", "いいえ"],
        jsonKey: "overtimeAcceptable",
      },
    ],
  },
  {
    title: "転職の理由",
    questions: [
      {
        key: "retirementReason",
        question: "今のお仕事を辞めた（辞めたい）理由を教えてください。",
        type: "textarea",
        existingField: "retirementReason",
        priority: "must",
        hint: "例：もっと専門的な仕事に挑戦したいからです。",
      },
      {
        key: "employmentStatus",
        question: "今の就業状況を教えてください。",
        type: "select",
        options: ["在職中", "退職済み"],
        jsonKey: "employmentStatus",
        priority: "must",
      },
    ],
  },
  {
    title: "応募理由・希望エリア・希望の給料",
    questions: [
      {
        key: "motivation",
        question: "弊社の求人に応募した理由を教えてください。",
        type: "textarea",
        existingField: "motivation",
        priority: "must",
        hint: "例：寮があり、長く働けそうだと思ったからです。",
      },
      {
        key: "preferredLocation",
        question: "希望する勤務地（エリア）を教えてください。",
        type: "text",
        jsonKey: "preferredLocation",
        priority: "must",
        hint: "例：東京・神奈川 ／ どこでも大丈夫です",
      },
      {
        key: "desiredTakeHome",
        question: "希望する給料（手取り）を教えてください。",
        type: "text",
        jsonKey: "desiredTakeHome",
        priority: "must",
        hint: "例：月 20万円以上",
      },
    ],
  },
  {
    title: "面接・入社の可否",
    questions: [
      {
        key: "interviewAvailability",
        question: "面接ができる日時を教えてください。",
        type: "textarea",
        jsonKey: "interviewAvailability",
        priority: "must",
        hint: "例：平日の午後。土日も大丈夫です。",
      },
      {
        key: "availableStartDate",
        question: "いつから入社できますか。",
        type: "text",
        jsonKey: "availableStartDate",
        priority: "must",
        hint: "例：2025年10月から ／ すぐに",
      },
      {
        key: "inPersonInterview",
        question: "対面での面接はできますか。",
        type: "select",
        options: ["はい", "いいえ"],
        jsonKey: "inPersonInterview",
        showIf: { locationIn: ["domestic"] },
      },
      {
        key: "otherInterviews",
        question: "今、ほかの会社の面接も受けていますか。",
        type: "textarea",
        jsonKey: "otherInterviews",
        hint: "例：はい、1社受けています。／ いいえ。",
      },
    ],
  },
  {
    title: "日本での将来の目標",
    questions: [
      {
        key: "desiredWorkYears",
        question: "日本で、どのくらいの期間 働きたいですか。",
        type: "text",
        jsonKey: "desiredWorkYears",
        priority: "must",
        hint: "例：5年以上 ／ できるだけ長く",
      },
      {
        key: "futurePlan",
        question: "将来、日本でどんな仕事や生活をしたいですか。",
        type: "textarea",
        jsonKey: "futurePlan",
        priority: "must",
        hint: "例：現場のリーダーになりたい。家族を日本に呼びたい。",
      },
      {
        key: "longTermIntent",
        question: "同じ業種で長く働きたいですか。",
        type: "select",
        options: ["はい", "いいえ"],
        jsonKey: "longTermIntent",
      },
      {
        key: "homeReturnPlan",
        question: "一時帰国の予定はありますか。",
        type: "select",
        options: ["あり", "なし"],
        jsonKey: "homeReturnPlan",
      },
    ],
  },
  {
    title: "日本語について",
    questions: [
      {
        key: "japaneseLearningDuration",
        question: "日本語は、どのくらいの期間 勉強していますか。",
        type: "text",
        jsonKey: "japaneseLearningDuration",
        hint: "例：2年6か月",
      },
      {
        key: "japaneseLearningMethod",
        question: "毎日、どのように日本語を勉強していますか。",
        type: "textarea",
        jsonKey: "japaneseLearningMethod",
        hint: "例：学校とアプリで勉強しています。",
      },
      {
        key: "kanaReading",
        question: "ひらがな・カタカナは読めますか。",
        type: "select",
        options: ["読める", "少し読める", "読めない"],
        jsonKey: "kanaReading",
      },
    ],
  },
  {
    title: "特定技能・これまでの経験",
    questions: [
      {
        key: "tokuteiTestStatus",
        question: "特定技能の試験には合格していますか。",
        type: "select",
        options: ["合格", "勉強中", "未受験"],
        jsonKey: "tokuteiTestStatus",
        // 技人国・永住の候補者には特定技能試験は関係ないので出さない
        showIf: { residenceStatusNotIn: ["技術・人文知識・国際業務", "永住"] },
      },
      {
        key: "pastJapanWorkExperience",
        question: "以前、日本で働いた経験はありますか。",
        type: "textarea",
        jsonKey: "pastJapanWorkExperience",
        hint: "例：はい、工場で1年働きました。／ いいえ。",
      },
      {
        key: "drivingLicensePlan",
        question: "運転免許について教えてください。",
        type: "select",
        options: ["取得済み", "取得予定あり", "取得予定なし"],
        jsonKey: "drivingLicensePlan",
      },
    ],
  },
  {
    title: "性格・人柄",
    questions: [
      {
        key: "selfIntroduction",
        question: "簡単に自己紹介をしてください。",
        type: "textarea",
        existingField: "selfIntroduction",
        hint: "例：はじめまして。○○です。まじめに頑張ります。",
      },
      {
        key: "strengths",
        question: "あなたの長所を教えてください。",
        type: "textarea",
        jsonKey: "strengths",
        hint: "例：まじめで、最後まで責任を持ってやり遂げます。",
      },
      {
        key: "weaknesses",
        question: "あなたの短所を教えてください。",
        type: "textarea",
        jsonKey: "weaknesses",
        hint: "例：慎重すぎることがあります。確認を徹底しています。",
      },
      {
        key: "mistakeResponse",
        question: "仕事でミスをした時は、どうしますか。",
        type: "textarea",
        jsonKey: "mistakeResponse",
        hint: "例：すぐに報告して、原因を確認し、再発を防ぎます。",
      },
      {
        key: "stressManagement",
        question: "ストレスを感じた時は、どうしていますか。",
        type: "textarea",
        jsonKey: "stressManagement",
        hint: "例：運動や睡眠でリフレッシュします。",
      },
      {
        key: "exerciseHabit",
        question: "普段、運動はしていますか。",
        type: "text",
        jsonKey: "exerciseHabit",
        hint: "例：週2回ジョギングをしています。",
      },
    ],
  },
  {
    title: "その他の確認",
    questions: [
      {
        key: "jobUnderstanding",
        question: "求人の内容は、もう理解していますか。",
        type: "select",
        options: ["はい", "いいえ"],
        jsonKey: "jobUnderstanding",
      },
      {
        key: "movingCostReady",
        question: "引っ越し費用や初期費用は準備できますか。",
        type: "select",
        options: ["はい", "いいえ"],
        jsonKey: "movingCostReady",
        showIf: { locationIn: ["domestic"] },
      },
      {
        key: "noMovingSupportOk",
        question: "引っ越しのサポートがなくても大丈夫ですか。",
        type: "select",
        options: ["はい", "いいえ"],
        jsonKey: "noMovingSupportOk",
        showIf: { locationIn: ["domestic"] },
      },
      {
        key: "flightCostSelf",
        question: "飛行機代は自己負担になりますが、大丈夫ですか。",
        type: "select",
        options: ["はい", "いいえ"],
        jsonKey: "flightCostSelf",
        showIf: { locationIn: ["overseas"] },
      },
      {
        key: "familySupport",
        question: "ご家族は、日本で働くことに賛成していますか。",
        type: "select",
        options: ["はい", "いいえ"],
        jsonKey: "familySupport",
      },
      {
        key: "childPlan",
        question: "近い将来、お子様の予定はありますか。",
        type: "select",
        options: ["予定あり", "予定なし", "未定"],
        jsonKey: "childPlan",
      },
      {
        key: "candidateQuestions",
        question: "何か質問はありますか。",
        type: "textarea",
        jsonKey: "candidateQuestions",
        hint: "例：配属先はどこですか。／ 特にありません。",
      },
      {
        key: "companyInquiry",
        question: "会社について、知りたいことはありますか。",
        type: "textarea",
        jsonKey: "companyInquiry",
        hint: "例：寮の有無を知りたいです。",
      },
    ],
  },
];

/** すべての質問をフラットに走査するためのヘルパー */
export function allInterviewQuestions(): InterviewQuestion[] {
  return INTERVIEW_SECTIONS.flatMap((s) => s.questions);
}

/**
 * 条件に合う質問だけを残したセクション一覧を組み立てる。
 * 質問が 0 件になったセクションは返さない。
 *
 *   priority   … "must" なら必須質問だけ、"optional" なら任意質問だけ
 *   ctx        … 在留資格 / 居住地 による分岐
 *   isExcluded … 担当者が intakeConfig で除外した質問
 *   isAnswered … すでに回答済み (履歴書 AI 抽出で埋まった等) の質問は出さない
 */
export function buildInterviewSections(opts: {
  priority: QuestionPriority;
  ctx: QuestionContext;
  isExcluded?: (q: InterviewQuestion) => boolean;
  isAnswered?: (q: InterviewQuestion) => boolean;
}): InterviewSection[] {
  const { priority, ctx, isExcluded, isAnswered } = opts;
  const result: InterviewSection[] = [];
  for (const section of INTERVIEW_SECTIONS) {
    const questions = section.questions.filter((q) => {
      if ((q.priority ?? "optional") !== priority) return false;
      if (!isQuestionVisible(q, ctx)) return false;
      if (isExcluded?.(q)) return false;
      if (isAnswered?.(q)) return false;
      return true;
    });
    if (questions.length > 0) {
      result.push({ title: section.title, description: section.description, questions });
    }
  }
  return result;
}
