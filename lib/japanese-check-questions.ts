/**
 * 日本語チェックの質問定義 (クライアント/サーバー共通、依存なし)。
 * lib/japanese-check.ts は @google/genai を import するため client に含めたくない。
 * 質問データだけはここに置き、両方から参照する。
 *
 * ── 5 問の設計意図 ──
 * 「準備できる発話」から「その場で作る発話」へ、短文から長文へと段階的に負荷を上げ、
 * 各問が別々の能力の証拠になるように並べている。1 問だけでは偶然に左右されるため、
 * 難易度の違う 5 問の結果を突き合わせて判定する (lib/japanese-check.ts のルール参照)。
 *
 *   1 音読       … 発音・読字。台本があるので「文を作る力」抜きで発音だけを見られる
 *   2 自己紹介   … 準備できる定型発話。暗記でも話せるので下限の確認に使う
 *   3 仕事の経験 … 応募したい分野での経験を説明する。長めの説明ができるかの証拠
 *   4 日本に来た理由 … 理由の表現 (〜から / 〜ので) を使えるか
 *   5 日本語の勉強方法 … 習慣・方法をその場で順序立てて話せるか
 *
 * 受験の流れ (app/japanese-check/[token]): 「テスト開始」→ 1 問ずつ表示 →
 * 表示と同時に録音開始・制限時間 (seconds) で自動停止 →「次へ」。前の問には戻れず、
 * 受験は 1 回のみ。答えを準備したり調べたりできないようにするため。
 *
 * 注意: 設問は画面に文字で提示されるため、これは「聴解」ではなく
 *       「読んで理解し、話して答える力」の測定である (判定文にもそう書く)。
 */

export type JapaneseCheckQuestion = {
  key: string;
  /** 候補者に見せる指示文 (日本語 + 英語併記) */
  prompt: string;
  /** 音読課題ならその文。自由回答なら null */
  readAloud: string | null;
  /** 制限時間 (秒)。問題の表示と同時に録音が始まり、この秒数で自動停止する */
  seconds: number;
  /** この問で主に何を見るか (AI への指示と管理画面の表示に使う) */
  focus: string;
  /** 自由発話としてこれくらいは欲しい長さ (拍数)。評価の「発話量が足りるか」判定に使う */
  expectedMora: number;
};

export const JAPANESE_CHECK_QUESTIONS: JapaneseCheckQuestion[] = [
  {
    key: "read_aloud",
    prompt: "次の文を声に出して読んでください。 / Please read this sentence aloud.",
    readAloud:
      "私は日本で働きたいです。毎日、日本語を勉強しています。仕事のときは、安全に気をつけます。分からないことは、すぐに先輩に聞きます。",
    seconds: 30,
    focus: "発音・読字（台本があるので、文を作る力とは切り離して発音だけを見る）",
    expectedMora: 0,
  },
  {
    key: "self_intro",
    prompt:
      "かんたんに自己紹介をしてください。（名前・国・仕事の経験） / Please introduce yourself briefly (name, country, work experience).",
    readAloud: null,
    seconds: 30,
    focus: "準備できる定型発話。暗記でも話せるため、能力の下限の確認に使う",
    expectedMora: 40,
  },
  {
    // 職歴を聞く問。未経験の分野に応募する人もいるため「その分野での経験」を聞き、
    // 無ければ無いなりに説明する (それ自体が説明力の証拠になる)
    key: "work_experience",
    prompt:
      "今後応募したい分野での仕事の経験について教えてください。 / Please tell us about your work experience in the field you want to apply for.",
    readAloud: null,
    seconds: 40,
    focus: "仕事の経験を具体的に説明できるか。長めの説明ができるかで N3 以上が分かれる",
    expectedMora: 60,
  },
  {
    key: "reason_japan",
    prompt: "日本に来た理由を教えてください。 / Why did you come to Japan?",
    readAloud: null,
    seconds: 30,
    focus: "理由を述べられるか（〜から / 〜ので などの理由の表現）",
    expectedMora: 40,
  },
  {
    key: "study_method",
    prompt:
      "普段、どのように日本語を勉強していますか？ / How do you usually study Japanese?",
    readAloud: null,
    seconds: 30,
    focus: "習慣や方法を順序立てて話せるか（その場で文を作る力）",
    expectedMora: 40,
  },
];

/**
 * 以前使っていた設問 (2026/09 に 3〜5 問目を差し替え)。
 * 旧設問で録音した候補者を「再判定」するときに設問文・評価観点を引けるよう残している。
 * 候補者の画面には出さない。
 */
const LEGACY_JAPANESE_CHECK_QUESTIONS: JapaneseCheckQuestion[] = [
  {
    key: "daily_qa",
    prompt:
      "きのうは何をしましたか。くわしく話してください。 / What did you do yesterday? Please tell us in detail.",
    readAloud: null,
    seconds: 20,
    focus: "過去形での短い叙述。その場で文を作れるか",
    expectedMora: 35,
  },
  {
    key: "work_scenario",
    prompt:
      "仕事中に、あなたが何か失敗をしてしまいました。そのあと、どうしますか。 / You made a mistake at work. What do you do next?",
    readAloud: null,
    seconds: 30,
    focus: "困ったときに報告・相談できるか",
    expectedMora: 40,
  },
  {
    key: "explain_past",
    prompt:
      "今までの仕事や勉強で、一番大変だったことは何ですか。なぜ大変でしたか。 / What was the hardest thing in your work or studies? Why was it hard?",
    readAloud: null,
    seconds: 40,
    focus: "長めの説明と理由づけ。接続表現が使えるかで N3 以上が分かれる",
    expectedMora: 60,
  },
];

/** key から質問定義を引く (旧設問も含む) */
export function findJapaneseCheckQuestion(key: string): JapaneseCheckQuestion | undefined {
  return (
    JAPANESE_CHECK_QUESTIONS.find((q) => q.key === key) ??
    LEGACY_JAPANESE_CHECK_QUESTIONS.find((q) => q.key === key)
  );
}
