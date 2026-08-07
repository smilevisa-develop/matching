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
 *   3 昨日のこと … 過去形での短い叙述。その場で文を作る必要がある
 *   4 仕事の場面 … 仮定の状況への対応 (報告・連絡)。実務で使えるかの証拠
 *   5 一番大変… … 長めの説明 + 理由づけ。接続表現が使えるかで N3 以上が分かれる
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
  /** 目安の録音秒数 */
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
    seconds: 20,
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
      "仕事中に、機械が急に止まりました。あなたはどうしますか。 / A machine suddenly stops while you are working. What do you do?",
    readAloud: null,
    seconds: 30,
    focus: "仮定の場面への対応（報告・連絡ができるか）。実務で使えるかの証拠",
    expectedMora: 40,
  },
  {
    key: "explain_past",
    prompt:
      "今までの仕事で、一番大変だったことは何ですか。なぜ大変でしたか。 / What was the hardest thing in your past work? Why was it hard?",
    readAloud: null,
    seconds: 40,
    focus: "長めの説明と理由づけ。接続表現が使えるかで N3 以上が分かれる",
    expectedMora: 60,
  },
];

/** key から質問定義を引く */
export function findJapaneseCheckQuestion(key: string): JapaneseCheckQuestion | undefined {
  return JAPANESE_CHECK_QUESTIONS.find((q) => q.key === key);
}
