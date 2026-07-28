/**
 * 日本語チェックの質問定義 (クライアント/サーバー共通、依存なし)。
 * lib/japanese-check.ts は @google/genai を import するため client に含めたくない。
 * 質問データだけはここに置き、両方から参照する。
 */

export type JapaneseCheckQuestion = {
  key: string;
  /** 候補者に見せる指示文 (日本語 + 英語併記) */
  prompt: string;
  /** 音読課題ならその文。自由回答なら null */
  readAloud: string | null;
  /** 目安の録音秒数 */
  seconds: number;
};

export const JAPANESE_CHECK_QUESTIONS: JapaneseCheckQuestion[] = [
  {
    key: "read_aloud",
    prompt: "次の文を声に出して読んでください。 / Please read this sentence aloud.",
    readAloud:
      "私は日本で働きたいです。毎日、日本語を勉強しています。仕事では、安全に気をつけて頑張ります。",
    seconds: 20,
  },
  {
    key: "self_intro",
    prompt:
      "かんたんに自己紹介をしてください。（名前・国・仕事の経験など） / Please introduce yourself briefly.",
    readAloud: null,
    seconds: 30,
  },
  {
    key: "motivation",
    prompt:
      "なぜ日本で働きたいですか？あなたの言葉で話してください。 / Why do you want to work in Japan? Please answer in your own words.",
    readAloud: null,
    seconds: 30,
  },
];
