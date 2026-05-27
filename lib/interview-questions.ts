/**
 * 面接前ヒアリング (事前質問) の定義。
 *
 * - 既存 ResumeProfile カラム (motivation / selfIntroduction / japanPurpose /
 *   currentJob / retirementReason) に紐づく質問は existingField を指定する。
 *   これらは履歴書テンプレの placeholder ({{志望動機}} 等) に直接反映される。
 * - それ以外の質問は jsonKey を指定し、ResumeProfile.interviewAnswers Json に
 *   { jsonKey: answer } 形式で保存する。
 */

export type InterviewQuestion = {
  /** UI のフォーム key (一意) */
  key: string;
  /** 質問文 */
  question: string;
  /** 補足/プレースホルダ */
  hint?: string;
  /** 入力タイプ */
  type?: "text" | "textarea" | "select";
  /** select 用の選択肢 */
  options?: string[];
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

export const INTERVIEW_SECTIONS: InterviewSection[] = [
  {
    title: "日本に来た理由・将来",
    questions: [
      {
        key: "japanPurpose",
        question: "なぜ日本で働きたいですか？",
        type: "textarea",
        existingField: "japanPurpose",
        hint: "履歴書テンプレ {{来日目的}} に反映",
      },
      {
        key: "motivation",
        question: "なぜこの職種を選びましたか？/ なぜ弊社の求人に応募したいと思いましたか？",
        type: "textarea",
        existingField: "motivation",
        hint: "履歴書テンプレ {{志望動機}} に反映",
      },
      {
        key: "retirementReason",
        question: "なぜ今の会社を辞めたいですか？（もう退職しましたか？）",
        type: "textarea",
        existingField: "retirementReason",
        hint: "履歴書テンプレ {{退職理由}} に反映",
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
        hint: "履歴書テンプレ {{現在の仕事}} に反映",
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
        hint: "履歴書テンプレ {{自己紹介}} に反映",
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
        key: "companyAwareness",
        question: "弊社がどんな会社か知っていますか？",
        type: "text",
        jsonKey: "companyAwareness",
      },
      {
        key: "noHousingOk",
        question:
          "この求人は社宅がありません。ご自身で部屋を探す必要がありますが、大丈夫ですか？",
        type: "text",
        jsonKey: "noHousingOk",
      },
      {
        key: "movingCostReady",
        question: "引っ越し費用や初期費用は準備できますか？",
        type: "text",
        jsonKey: "movingCostReady",
      },
      {
        key: "noMovingSupportOk",
        question: "引っ越しサポートがなくても問題ありませんか？",
        type: "text",
        jsonKey: "noMovingSupportOk",
      },
      {
        key: "flightCostSelf",
        question: "（海外在住の場合）飛行機代は自己負担ですが、大丈夫ですか？",
        type: "text",
        jsonKey: "flightCostSelf",
      },
      {
        key: "availableStartDate",
        question: "いつから入社できますか？",
        type: "text",
        jsonKey: "availableStartDate",
      },
      {
        key: "inPersonInterview",
        question: "対面での面接は可能ですか？",
        type: "text",
        jsonKey: "inPersonInterview",
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
