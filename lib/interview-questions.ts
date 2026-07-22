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
    description: "最初に 1 つだけ教えてください。この回答で、あとの質問が変わります。",
    questions: [
      {
        key: LOCATION_QUESTION_KEY,
        question: "今どこに住んでいますか？ / Where do you live now?",
        type: "select",
        options: ["日本", "海外"],
        jsonKey: LOCATION_QUESTION_KEY,
        priority: "must",
      },
    ],
  },
  {
    title: "日本に来た理由・将来",
    questions: [
      {
        key: "japanPurpose",
        question: "なぜ日本で働きたいですか？",
        type: "textarea",
        existingField: "japanPurpose",
        priority: "must",
      },
      {
        key: "motivation",
        question: "なぜ弊社の求人に応募したいと思いましたか？",
        type: "textarea",
        existingField: "motivation",
        priority: "must",
      },
      {
        // 「もう退職しましたか？」は employmentStatus に分離した。
        // ここは退職 (予定) の 理由 だけを聞く
        key: "retirementReason",
        question: "なぜ今の会社を辞めたいですか？",
        type: "textarea",
        existingField: "retirementReason",
        priority: "must",
      },
      {
        key: "employmentStatus",
        question: "もう退職しましたか？",
        type: "select",
        options: ["退職済み", "在職中"],
        jsonKey: "employmentStatus",
        priority: "must",
      },
      {
        key: "desiredWorkYears",
        question: "日本で何年間くらい働きたいですか？",
        type: "text",
        jsonKey: "desiredWorkYears",
      },
      {
        key: "futurePlan",
        question: "将来、日本でどのような生活や仕事をしたいですか？",
        type: "textarea",
        jsonKey: "futurePlan",
      },
      {
        key: "preferredLocation",
        question: "希望の勤務地はどこですか？また、その理由を教えてください。",
        type: "textarea",
        jsonKey: "preferredLocation",
        priority: "must",
      },
      {
        key: "japanArrivalDate",
        question: "いつ日本へ来ましたか？（海外在住の場合：いつ日本へ来る予定ですか？）",
        type: "text",
        jsonKey: "japanArrivalDate",
        hint: "例: 2023年4月 / 2026年8月予定",
      },
    ],
  },
  {
    title: "仕事経験・勤務条件",
    questions: [
      {
        key: "currentJob",
        question: "現在のお仕事は何ですか？仕事内容を教えてください。",
        type: "textarea",
        existingField: "currentJob",
        priority: "must",
      },
      {
        key: "sameJobExperience",
        question: "これまで同じ仕事の経験はありますか？",
        type: "textarea",
        jsonKey: "sameJobExperience",
      },
      {
        key: "workChallenge",
        question: "仕事で大変だったことは何ですか？また、どうやって解決しましたか？",
        type: "textarea",
        jsonKey: "workChallenge",
      },
      {
        key: "teamworkExperience",
        question: "チームで働いた経験はありますか？",
        type: "textarea",
        jsonKey: "teamworkExperience",
      },
      {
        key: "physicalConfidence",
        question: "体力には自信がありますか？",
        type: "text",
        jsonKey: "physicalConfidence",
      },
      {
        key: "overtimeAcceptable",
        question: "残業やシフト勤務は可能ですか？",
        type: "text",
        jsonKey: "overtimeAcceptable",
        priority: "must",
      },
      {
        key: "currentSalary",
        question: "現在のお給料はいくらですか？",
        type: "text",
        jsonKey: "currentSalary",
      },
      {
        key: "currentOvertimeHours",
        question: "毎月どのくらい残業していますか？",
        type: "text",
        jsonKey: "currentOvertimeHours",
      },
      {
        key: "currentTakeHome",
        question: "社会保険・家賃などを引いた後の手取りはいくらですか？",
        type: "text",
        jsonKey: "currentTakeHome",
      },
      {
        key: "desiredTakeHome",
        question: "希望する手取り額はいくらですか？",
        type: "text",
        jsonKey: "desiredTakeHome",
        priority: "must",
      },
      {
        key: "drivingLicensePlan",
        question: "運転免許を取得する予定はありますか？",
        type: "text",
        jsonKey: "drivingLicensePlan",
      },
    ],
  },
  {
    title: "日本語力について",
    questions: [
      {
        key: "japaneseLearningDuration",
        question: "日本語はどのくらい勉強していますか？",
        type: "text",
        jsonKey: "japaneseLearningDuration",
        hint: "例: 2年6ヶ月",
        priority: "must",
      },
      {
        key: "japaneseLearningMethod",
        question: "毎日どのように日本語を勉強していますか？",
        type: "textarea",
        jsonKey: "japaneseLearningMethod",
      },
      {
        key: "kanaReading",
        question: "ひらがな・カタカナは読めますか？",
        type: "text",
        jsonKey: "kanaReading",
      },
    ],
  },
  {
    title: "特定技能・日本での生活",
    questions: [
      {
        key: "tokuteiTestStatus",
        question: "特定技能試験には合格していますか？",
        type: "text",
        jsonKey: "tokuteiTestStatus",
        // 技人国・永住の候補者には特定技能試験は関係ないので出さない
        showIf: { residenceStatusNotIn: ["技術・人文知識・国際業務", "永住"] },
      },
      {
        key: "pastJapanWorkExperience",
        question: "以前、日本で働いた経験はありますか？",
        type: "textarea",
        jsonKey: "pastJapanWorkExperience",
      },
      {
        key: "longTermIntent",
        question: "同じ業種で長く働く意思はありますか？",
        type: "text",
        jsonKey: "longTermIntent",
      },
      {
        key: "homeReturnPlan",
        question: "一時帰国の予定はありますか？",
        type: "text",
        jsonKey: "homeReturnPlan",
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
        priority: "must",
      },
      {
        key: "strengths",
        question: "あなたの長所を教えてください。",
        type: "textarea",
        jsonKey: "strengths",
      },
      {
        key: "weaknesses",
        question: "あなたの短所を教えてください。",
        type: "textarea",
        jsonKey: "weaknesses",
      },
      {
        key: "mistakeResponse",
        question: "仕事でミスをした時はどうしますか？",
        type: "textarea",
        jsonKey: "mistakeResponse",
      },
      {
        key: "stressManagement",
        question: "ストレスを感じた時はどうしていますか？",
        type: "textarea",
        jsonKey: "stressManagement",
      },
      {
        key: "exerciseHabit",
        question: "普段、運動はしていますか？どんなスポーツをしますか？",
        type: "text",
        jsonKey: "exerciseHabit",
      },
    ],
  },
  {
    title: "求人・入社条件の確認",
    questions: [
      {
        key: "jobUnderstanding",
        question: "求人内容について、すでに理解していますか？",
        type: "text",
        jsonKey: "jobUnderstanding",
      },
      {
        key: "movingCostReady",
        question: "引っ越し費用や初期費用は準備できますか？",
        type: "text",
        jsonKey: "movingCostReady",
        showIf: { locationIn: ["domestic"] },
      },
      {
        key: "noMovingSupportOk",
        question: "引っ越しサポートがなくても問題ありませんか？",
        type: "text",
        jsonKey: "noMovingSupportOk",
        showIf: { locationIn: ["domestic"] },
      },
      {
        key: "flightCostSelf",
        question: "飛行機代は自己負担ですが、大丈夫ですか？",
        type: "text",
        jsonKey: "flightCostSelf",
        showIf: { locationIn: ["overseas"] },
      },
      {
        key: "availableStartDate",
        question: "いつから入社できますか？",
        type: "text",
        jsonKey: "availableStartDate",
        priority: "must",
      },
      {
        key: "inPersonInterview",
        question: "対面での面接は可能ですか？",
        type: "text",
        jsonKey: "inPersonInterview",
        showIf: { locationIn: ["domestic"] },
      },
      {
        key: "otherInterviews",
        question: "他の会社の面接も受けていますか？",
        type: "textarea",
        jsonKey: "otherInterviews",
      },
      {
        key: "interviewAvailability",
        question: "面接可能な日時を教えてください。",
        type: "textarea",
        jsonKey: "interviewAvailability",
        priority: "must",
      },
      {
        key: "childPlan",
        question: "近い将来、お子様の予定はありますか？",
        type: "text",
        jsonKey: "childPlan",
      },
    ],
  },
  {
    title: "最後の確認",
    questions: [
      {
        key: "familySupport",
        question: "ご家族は日本で働くことに賛成していますか？",
        type: "text",
        jsonKey: "familySupport",
        priority: "must",
      },
      {
        key: "candidateQuestions",
        question: "何か質問はありますか？",
        type: "textarea",
        jsonKey: "candidateQuestions",
      },
      {
        key: "companyInquiry",
        question: "会社について知りたいことはありますか？",
        type: "textarea",
        jsonKey: "companyInquiry",
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
