/**
 * 事前面談前の 日本語チェック 定義と AI 判定。
 *
 * 候補者は intake フォームで 3 問を録音するだけ。
 * それを Gemini 2.5 Flash が音声のまま読み取り、
 * 文字起こし + JLPT/JFT 相当レベル + 4 観点スコア + 所見 を返す。
 */

import { GoogleGenAI } from "@google/genai";

/** 録音してもらう質問。key は保存キー、readAloud は音読課題 */
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

/** 各問の録音入力 (base64 音声) */
export type JapaneseCheckRecording = {
  key: string;
  mimeType: string;
  base64: string;
};

/** Gemini が返す判定結果 */
export type JapaneseCheckResult = {
  estimatedLevel: string; // 例 "N3 相当"
  pronunciation: number; // 1〜5
  fluency: number;
  vocabulary: number;
  grammar: number;
  summary: string; // 面接官向け所見
  transcripts: { key: string; transcript: string }[];
};

/** Gemini が受け付ける音声 MIME か */
function isSupportedAudio(mime: string): boolean {
  const m = mime.toLowerCase();
  return (
    m.startsWith("audio/") ||
    // iOS Safari は video/mp4 を返すことがある (音声のみでも)
    m === "video/mp4" ||
    m === "video/webm"
  );
}

const SYSTEM_PROMPT = `あなたは特定技能・技能実習の外国人材を評価する日本語能力アセスメントの専門家です。
候補者が録音した音声を聞き、日本語能力を評価してください。

# 評価の観点 (各 1〜5 の整数。5 が最良)
- pronunciation: 発音の明瞭さ・聞き取りやすさ
- fluency: 話す速さ・淀みの少なさ・自然さ
- vocabulary: 語彙の豊富さ・適切さ
- grammar: 文法・助詞・敬語の正確さ

# 推定レベル (estimatedLevel)
JLPT / JFT-Basic 相当で推定し、必ず「N5 相当」「N4 相当」「N3 相当」「N2 相当」「N1 相当」
「日本語ほぼ不可」のいずれかの文字列にする。

# 所見 (summary)
面接官が実務判断に使える 1〜2 文の日本語コメント。
「どの業種なら通用するか / どこが不安か」を具体的に書く。
例:「発音は明瞭で自己紹介は問題なし。敬語と長文はやや不安。製造・農業なら可、接客はやや厳しい。」

# 文字起こし (transcripts)
各録音について、聞き取れた内容を日本語で文字起こしする。
1 問目は音読課題なので、正しく読めているかも判断材料にする。

# 注意
- あくまで参考値。断定的すぎる表現は避ける。
- 音声が短い/無音/聞き取れない場合は、その旨を summary に書き、スコアは低めにする。`;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    estimatedLevel: { type: "string" },
    pronunciation: { type: "integer" },
    fluency: { type: "integer" },
    vocabulary: { type: "integer" },
    grammar: { type: "integer" },
    summary: { type: "string" },
    transcripts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string" },
          transcript: { type: "string" },
        },
        required: ["key", "transcript"],
      },
    },
  },
  required: [
    "estimatedLevel",
    "pronunciation",
    "fluency",
    "vocabulary",
    "grammar",
    "summary",
    "transcripts",
  ],
} as const;

function clampScore(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(5, Math.round(n)));
}

/**
 * 録音音声を Gemini に渡して日本語能力を判定する。
 */
export async function judgeJapaneseFromAudio(
  recordings: JapaneseCheckRecording[],
): Promise<JapaneseCheckResult> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY が未設定です");

  const usable = recordings.filter((r) => isSupportedAudio(r.mimeType) && r.base64);
  if (usable.length === 0) throw new Error("判定できる音声がありません");

  const model = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
  const client = new GoogleGenAI({ apiKey });

  // 各録音の前に「どの問か」を示すテキストを挟んでから音声を渡す
  const parts: { text?: string; inlineData?: { mimeType: string; data: string } }[] = [
    { text: SYSTEM_PROMPT },
  ];
  for (const r of usable) {
    const q = JAPANESE_CHECK_QUESTIONS.find((x) => x.key === r.key);
    parts.push({
      text: `--- 録音 key="${r.key}" (${q?.readAloud ? `音読課題: ${q.readAloud}` : q?.prompt ?? ""}) ---`,
    });
    parts.push({ inlineData: { mimeType: r.mimeType, data: r.base64 } });
  }
  parts.push({ text: "以上の音声を評価し、指定スキーマの JSON を 1 つだけ返してください。" });

  const response = await client.models.generateContent({
    model,
    contents: [{ role: "user", parts }],
    config: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA as unknown as Record<string, unknown>,
      temperature: 0.2,
    },
  });

  const text = response.text?.trim() ?? "";
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text);
  } catch {
    // まれに前後にゴミが付くので { } を抜き出す
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("Gemini の応答を JSON として解釈できませんでした");
    raw = JSON.parse(m[0]);
  }

  const transcripts = Array.isArray(raw.transcripts)
    ? (raw.transcripts as unknown[])
        .map((t) => {
          if (!t || typeof t !== "object") return null;
          const o = t as Record<string, unknown>;
          return {
            key: typeof o.key === "string" ? o.key : "",
            transcript: typeof o.transcript === "string" ? o.transcript : "",
          };
        })
        .filter((v): v is { key: string; transcript: string } => v !== null)
    : [];

  return {
    estimatedLevel: typeof raw.estimatedLevel === "string" ? raw.estimatedLevel : "判定不可",
    pronunciation: clampScore(raw.pronunciation),
    fluency: clampScore(raw.fluency),
    vocabulary: clampScore(raw.vocabulary),
    grammar: clampScore(raw.grammar),
    summary: typeof raw.summary === "string" ? raw.summary : "",
    transcripts,
  };
}
