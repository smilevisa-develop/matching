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
  /** 就業状況 (在職中/退職済み) がこのいずれかのときだけ表示 */
  employmentStatusIn?: string[];
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
  /** 就業状況 (在職中/退職済み) の回答。分岐に使う */
  employmentStatus?: string | null;
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
  const emp = ctx.employmentStatus?.trim();
  if (cond.employmentStatusIn && emp) {
    if (!cond.employmentStatusIn.includes(emp)) return false;
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

/** 手当・手取り・全部引いて残る額を 1 問にまとめた質問の key (2026/11 の項目確認表) */
export const TAKE_HOME_SUMMARY_KEY = "takeHomeSummary";

/** まとめる前の 3 問の回答があれば、まとめた質問の回答として読む (元の回答は消さない) */
export function withTakeHomeSummary(answers: Record<string, string>): Record<string, string> {
  if ((answers[TAKE_HOME_SUMMARY_KEY] ?? "").trim()) return answers;
  const fields = [
    ["手当", "currentAllowances"],
    ["手取り", "currentTakeHome"],
    ["全部引いて残る額", "netAfterDeductions"],
  ];
  // 日本語訳が付いていない回答は、元の文章のまま入れる
  const join = (ja: boolean) =>
    fields
      .map(([label, key]) => [label, ((ja && answers[`${key}__ja`]) || answers[key] || "").trim()])
      .filter(([, v]) => v)
      .map(([label, v]) => `${label}: ${v}`)
      .join(" ／ ");
  const summary = join(false);
  if (!summary) return answers;
  const ja = fields.some(([, key]) => answers[`${key}__ja`]) ? join(true) : "";
  return { ...answers, [TAKE_HOME_SUMMARY_KEY]: summary, ...(ja ? { [`${TAKE_HOME_SUMMARY_KEY}__ja`]: ja } : {}) };
}

/**
 * 候補者フォーム / 詳細情報 の質問。履歴書に必要な項目だけ (採用チームの整理 2026/10):
 *   日本語 (資格・会話レベル) / 給料 (総額・基本給・手当と手取りと残る額・残業・夜勤・ボーナス)
 *   / アパート (社宅か自分で借りるか・部屋タイプ・家賃) / 希望 (エリア・手取り・退職時期・入社時期・一時帰国・住まい)
 *   + 転職理由 (推薦リストにも出す)。これ以外の質問は 2026/11 の項目確認表でなくした (回答は DB に残っている)。
 */
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
    title: "日本語について",
    questions: [
      {
        key: "japaneseCertification",
        question: "持っている日本語の資格を教えてください。",
        type: "text",
        jsonKey: "japaneseCertification",
        priority: "must",
        hint: "例：JLPT N3（2024年12月）／ JFT-Basic 合格 ／ なし",
      },
      {
        key: "japaneseConversationLevel",
        question: "日本語での会話は、どのくらいできますか。",
        type: "select",
        options: ["あいさつ程度", "簡単な日常会話", "仕事の指示が分かる", "自由に話せる"],
        jsonKey: "japaneseConversationLevel",
        priority: "must",
      },
    ],
  },
  {
    title: "給料について（今または直近の仕事）",
    questions: [
      {
        key: "employmentStatus",
        question: "今の就業状況を教えてください。",
        type: "select",
        options: ["在職中", "退職済み"],
        jsonKey: "employmentStatus",
        priority: "must",
      },
      {
        key: "currentSalary",
        question: "給料の総額（額面）はいくらですか。",
        type: "text",
        jsonKey: "currentSalary",
        priority: "must",
        hint: "例：月 22万円",
      },
      {
        key: "currentBaseSalary",
        question: "基本給はいくらですか。",
        type: "text",
        jsonKey: "currentBaseSalary",
        priority: "must",
        hint: "例：月 18万円",
      },
      {
        key: TAKE_HOME_SUMMARY_KEY,
        question: "手当（種類と金額）、手取り、全部引いて毎月残る額を教えてください。家賃が給料から引かれているかも書いてください。",
        type: "textarea",
        jsonKey: TAKE_HOME_SUMMARY_KEY,
        priority: "must",
        hint: "例：住宅手当 2万円、通勤手当 1万円 ／ 手取り 月 18万円 ／ 全部引いて月 13万円残る（家賃は給料から引かれている）",
      },
      {
        key: "currentOvertimeHours",
        question: "毎月、どのくらい残業していますか。",
        type: "text",
        jsonKey: "currentOvertimeHours",
        priority: "must",
        hint: "例：月 20時間くらい",
      },
      {
        key: "currentNightShift",
        question: "夜勤はありますか。",
        type: "select",
        options: ["あり", "なし"],
        jsonKey: "currentNightShift",
        priority: "must",
      },
      {
        key: "currentBonus",
        question: "ボーナスはありますか。（ある場合は年にいくらですか）",
        type: "text",
        jsonKey: "currentBonus",
        priority: "must",
        hint: "例：年 2回 合計 30万円 ／ なし",
      },
    ],
  },
  {
    title: "転職の理由",
    questions: [
      {
        key: "retirementReason",
        question: "お仕事を辞めた（辞めたい）理由を教えてください。",
        type: "textarea",
        existingField: "retirementReason",
        priority: "must",
        hint: "例：もっと専門的な仕事に挑戦したいからです。",
      },
    ],
  },
  {
    title: "アパートについて",
    questions: [
      {
        key: "housingType",
        question: "今はどこに住んでいますか。",
        type: "select",
        options: ["会社の社宅・寮", "自分で借りている", "家族・知人の家", "その他"],
        jsonKey: "housingType",
        priority: "must",
      },
      {
        key: "housingRoomType",
        question: "部屋のタイプを教えてください。",
        type: "select",
        options: ["個室", "共同（ルームシェア）"],
        jsonKey: "housingRoomType",
        priority: "must",
      },
      {
        key: "housingRent",
        question: "家賃はいくらですか。（自分が払っている金額）",
        type: "text",
        jsonKey: "housingRent",
        priority: "must",
        hint: "例：月 3万円（会社が半分負担）",
      },
    ],
  },
  {
    title: "希望について",
    questions: [
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
      {
        key: "plannedResignation",
        question: "今の会社は、いつ辞められますか。（退職時期）",
        type: "text",
        jsonKey: "plannedResignation",
        priority: "must",
        hint: "例：内定が出てから 1か月後 ／ もう辞めています",
        showIf: { employmentStatusIn: ["在職中"] },
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
        key: "homeVisitPlan",
        question: "一時帰国の予定はありますか。",
        type: "text",
        jsonKey: "homeVisitPlan",
        priority: "must",
        hint: "例：2026年12月に 2週間 ／ 予定なし",
      },
      {
        key: "desiredHousing",
        question: "住まいの希望を教えてください。",
        type: "text",
        jsonKey: "desiredHousing",
        priority: "must",
        hint: "例：会社の寮がいい（個室希望）／ 自分で借りたい",
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
/** 履歴書にそのまま載る文章の質問。候補者フォームの「履歴書のための質問」で聞く (辞めた理由は「転職の理由」で聞く) */
export const RESUME_TEXT_QUESTIONS: InterviewQuestion[] = [
  {
    key: "japanPurpose",
    question: "日本に来た（来る）目的を教えてください。",
    type: "textarea",
    existingField: "japanPurpose",
    priority: "must",
    hint: "例：家族のためにお金を稼ぎたい。日本の技術を学びたい。",
  },
  {
    key: "currentJob",
    question: "今の（または直近の）お仕事の内容を教えてください。",
    type: "textarea",
    existingField: "currentJob",
    priority: "must",
    hint: "例：工場でお弁当を作る仕事をしています。",
  },
  {
    key: "motivation",
    question: "弊社の求人に応募した理由を教えてください。",
    type: "textarea",
    existingField: "motivation",
    priority: "must",
    hint: "例：寮があり、長く働けそうだと思ったからです。",
  },
  {
    key: "selfIntroduction",
    question: "自己紹介と自己PRを書いてください。",
    type: "textarea",
    existingField: "selfIntroduction",
    hint: "例：はじめまして。○○です。まじめで、最後まで責任を持ってやり遂げます。",
  },
];

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
