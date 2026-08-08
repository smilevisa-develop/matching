/**
 * 事前面談前の 日本語チェック — 観察 (AI) と 判定 (コード) を分けた評価エンジン。
 *
 * ── なぜ 2 段階にするか ──
 * 以前は「音声を聞いて N3 相当と答えて」と AI に丸投げしていたため、
 *   ・同じ音声でも実行のたびに結果が変わる
 *   ・なぜその判定なのか説明できない
 *   ・短い/無音の録音でも、それらしいレベルが返ってしまう
 * という問題があった。
 *
 * そこで役割を分ける:
 *   1. AI (Gemini) は「観察できる事実」だけを出す
 *      … 文字起こし / 聞き取れた割合 / 質問に答えられたか / 文法の誤りの数 / 言い淀みの数 など。
 *        レベルやスコアは AI に出させない。
 *   2. レベルとスコアは、このファイルの明文化されたルールでコードが決定的に計算する
 *      … 同じ事実なら必ず同じ結論になり、根拠 (levelReason) も自動で書き出せる。
 *
 * 判定に使う数値の基準は下の SCORING に定数として並べてあり、
 * 運用しながらここだけ直せば全体の判定が変わる。
 *
 * ── この検査で測れるもの / 測れないもの ──
 * 設問は画面に文字で提示されるため、測っているのは
 *   「読んで理解し、日本語で話して答える力」。
 * 電話のような純粋な聴解力は測っていない。所見にもその前提を書く。
 */

import { generateContentRotating } from "./gemini-keys";
import { JAPANESE_CHECK_QUESTIONS, findJapaneseCheckQuestion } from "./japanese-check-questions";

export { JAPANESE_CHECK_QUESTIONS };
export type { JapaneseCheckQuestion } from "./japanese-check-questions";

/** 各問の録音入力 (base64 音声) */
export type JapaneseCheckRecording = {
  key: string;
  mimeType: string;
  base64: string;
  /** クライアントが計測した録音の長さ (秒)。話す速さの算出に使う。無くても判定は可能 */
  seconds?: number | null;
};

/** AI が観察した「事実」(判定・スコアは含まない) */
type ObservedFact = {
  key: string;
  transcript: string;
  audioIssue: "none" | "silent" | "too_short" | "unintelligible";
  /** 聞き取れた割合 0〜100 */
  intelligibility: number;
  /** 質問に答えられたか */
  taskAchieved: "full" | "partial" | "none";
  /** 日本語以外 (母国語・英語) で話した割合 0〜100 */
  nonJapaneseRatio: number;
  /** 助詞・活用・語順の誤りの数 */
  grammarErrorCount: number;
  /** 誤りの具体例 (最大 3 件) */
  grammarErrorExamples: string[];
  /** 明らかな言い淀み・3 秒以上の沈黙の回数 */
  hesitationCount: number;
  /** 使われた語彙の水準 1〜5 (下の VOCAB_ANCHORS のアンカーに従う) */
  vocabLevel: number;
  /** 音読問のみ: 台本どおり読めた割合 0〜100。他の問は null */
  readingAccuracy: number | null;
};

/** 事実 + コードが計算した派生値 */
export type JapaneseCheckPerQuestion = ObservedFact & {
  question: string;
  focus: string;
  /** 文字起こしから概算した拍 (モーラ) 数 */
  mora: number;
  /** 録音の長さ (秒)。クライアントが送っていれば入る */
  seconds: number | null;
  /** 話す速さ (拍/秒) */
  moraPerSec: number | null;
  /** 判定の材料として使えるか (無音・短すぎ・聞き取れない は除外) */
  usable: boolean;
};

/** 最終的な判定結果 */
export type JapaneseCheckResult = {
  estimatedLevel: string; // 例 "N3 相当"
  pronunciation: number; // 1〜5
  fluency: number;
  vocabulary: number;
  grammar: number;
  summary: string; // 面接官向け所見
  /** なぜこのレベルになったかのルールの足あと */
  levelReason: string;
  /** 判定の確からしさ (使えた録音の数で決まる) */
  confidence: "高" | "中" | "低";
  /** 根拠データ一式 (管理画面で開示する) */
  evidence: {
    perQuestion: JapaneseCheckPerQuestion[];
    metrics: {
      usableCount: number;
      totalQuestions: number;
      intelligibilityAvg: number;
      readingAccuracy: number | null;
      freeMoraTotal: number;
      moraPerSecAvg: number | null;
      grammarErrorPer100Mora: number | null;
      hesitationPer100Mora: number | null;
      nonJapaneseRatioAvg: number;
      achievementRate: number;
      composite: number;
    };
    /** 適用されたルール (上限規則など) の記録 */
    appliedRules: string[];
  };
  transcripts: { key: string; transcript: string }[];
};

// ────────────────────────────────────────────────────────────
// 判定ルールの定数。判定基準を変えたいときはここだけ直す。
// ────────────────────────────────────────────────────────────
const SCORING = {
  /** 発音: 聞き取れた割合 (と音読の正確さ) の合成値 → 5/4/3/2 点の下限 */
  pronunciationBands: [88, 74, 58, 38],
  /**
   * 流暢さ: 話す速さ (拍/秒) → 5/4/3/2 点の下限。
   * 日本語母語話者の自然な会話はおよそ 7〜8 拍/秒。学習者はこれより遅くなる。
   * 文字起こしからの概算なので、境界はゆるめに取っている。
   */
  fluencyRateBands: [5.0, 3.8, 2.6, 1.6],
  /** 言い淀みが 100 拍あたりこの数を超えたら流暢さを 1 段下げる / 2 段下げる */
  hesitationPenalty1: 8,
  hesitationPenalty2: 16,
  /** 文法: 100 拍あたりの誤り数 → 5/4/3/2 点の上限 (少ないほど良い) */
  grammarErrorBands: [1.5, 4, 8, 15],
  /** レベル判定に使う 4 観点の重み */
  weights: { pronunciation: 0.2, fluency: 0.3, vocabulary: 0.2, grammar: 0.3 },
  /** レベルの下限: [必要な総合点, 必要な課題達成率] */
  levels: [
    { level: "N1 相当", composite: 4.5, achievement: 0.9 },
    { level: "N2 相当", composite: 3.8, achievement: 0.85 },
    { level: "N3 相当", composite: 2.9, achievement: 0.65 },
    { level: "N4 相当", composite: 2.1, achievement: 0.4 },
    { level: "N5 相当", composite: 1.4, achievement: 0 },
  ],
  /** 自由発話でこの拍数に届かないと「話せる証拠が足りない」とみなす */
  minFreeMoraForFullJudgement: 60,
  /** 判定に使える録音がこの数未満なら判定不可 */
  minUsableForJudgement: 2,
} as const;

const LEVEL_ORDER = ["日本語ほぼ不可", "N5 相当", "N4 相当", "N3 相当", "N2 相当", "N1 相当"] as const;

/** レベルを指定の上限で頭打ちにする */
function capLevel(current: string, cap: string): string {
  const ci = LEVEL_ORDER.indexOf(current as (typeof LEVEL_ORDER)[number]);
  const capIdx = LEVEL_ORDER.indexOf(cap as (typeof LEVEL_ORDER)[number]);
  if (ci < 0 || capIdx < 0) return current;
  return ci > capIdx ? cap : current;
}

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

/**
 * 文字起こしから拍 (モーラ) 数を概算する。
 * 話す速さと発話量を、AI の主観を挟まずに数えるための指標。
 *   ひらがな・カタカナ・「ん」「っ」= 1 拍 / 拗音の小書き = 0 拍 (前の拍に含む)
 *   漢字 = 2 拍で概算 (音読みの平均) / 長音符 = 1 拍 / 英字 = 0.5 拍
 */
export function estimateMora(text: string): number {
  let mora = 0;
  for (const ch of text) {
    if (ch === "ー" || ch === "〜" || ch === "~") {
      mora += 1;
      continue;
    }
    if (/[\s、。，．,.!?！？「」『』（）()・…]/.test(ch)) continue;
    if (/[ぁぃぅぇぉゃゅょゎァィゥェォャュョヮ]/.test(ch)) continue;
    if (/[一-鿿]/.test(ch)) {
      mora += 2;
      continue;
    }
    if (/[a-zA-Z]/.test(ch)) {
      mora += 0.5;
      continue;
    }
    mora += 1;
  }
  return Math.round(mora);
}

/** 値を 5/4/3/2/1 の帯に落とす (大きいほど良い指標用) */
function bandDesc(value: number, bands: readonly number[]): number {
  if (value >= bands[0]) return 5;
  if (value >= bands[1]) return 4;
  if (value >= bands[2]) return 3;
  if (value >= bands[3]) return 2;
  return 1;
}

/** 値を 5/4/3/2/1 の帯に落とす (小さいほど良い指標用) */
function bandAsc(value: number, bands: readonly number[]): number {
  if (value <= bands[0]) return 5;
  if (value <= bands[1]) return 4;
  if (value <= bands[2]) return 3;
  if (value <= bands[3]) return 2;
  return 1;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function mean(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

const VOCAB_ANCHORS = `語彙の水準 (vocabLevel) は次のアンカーで 1〜5 の整数にする:
  1 = あいさつと単語の羅列のみ (例:「はい」「日本」「仕事」)
  2 = N5 相当。「〜です」「〜ます」の基本文型と身近な名詞だけ
  3 = N4〜N3 相当。日常語 + 仕事の基本語 (安全・確認・先輩・報告・準備 など) が出る
  4 = N2 相当。理由・条件・程度を表す語 (そのため・状況・確認・対応 など) を使える
  5 = N1 相当。抽象語や業務的な言い回しを自然に使える`;

const SYSTEM_PROMPT = `あなたは日本語音声の「観察者」です。評価やレベル判定は絶対にしないでください。
あなたの仕事は、聞こえた事実だけを数えて報告することです。レベル (N1〜N5) は別のプログラムが決めます。

# 各録音について報告する事実

- transcript: 聞こえたとおりに日本語で文字起こしする。
  言い間違い・助詞の誤りも直さずそのまま書く。聞き取れない箇所は「…」と書く。
  日本語以外で話している部分は [母国語] と書く。

- audioIssue: 音声そのものの状態
    "none"           = 問題なく聞ける
    "silent"         = ほぼ無音・声が入っていない
    "too_short"      = 声はあるが 2 秒未満で判断材料にならない
    "unintelligible" = 音は入っているが雑音などでほとんど聞き取れない

- intelligibility: 発話のうち何 % を聞き取れたか (0〜100 の整数)。
  「何を言ったか分かる」割合であり、内容の良し悪しではない。

- taskAchieved: 設問に答えられたか
    "full"    = 質問に正面から答えている
    "partial" = 部分的に答えている、または途中で終わっている
    "none"    = 質問と無関係、無言、または答えになっていない

- nonJapaneseRatio: 発話のうち日本語以外 (母国語・英語) の割合 (0〜100 の整数)。

- grammarErrorCount: 助詞・動詞の活用・語順の明らかな誤りの数 (整数)。
  聞き取れなかった箇所は数えない。自然な話し言葉の省略は誤りに数えない。

- grammarErrorExamples: 上の誤りの具体例を最大 3 件。「言った形 → 正しい形」の形式。

- hesitationCount: 明らかな言い淀み (「えーと」「あの…」の繰り返し) と
  3 秒以上の沈黙の合計回数 (整数)。

- vocabLevel: 使われた語彙の水準。
${VOCAB_ANCHORS}

- readingAccuracy: 音読課題の問だけ、台本どおりに読めた割合 (0〜100 の整数)。
  音読課題でない問は null。

# 守ること
- レベル (N1〜N5)・合否・スコアの総合評価は出さない。事実だけ報告する。
- 聞き取れないものを推測で補わない。分からなければ intelligibility を低くする。
- 無音や極端に短い録音に、それらしい文字起こしを作らない。audioIssue を正しく報告する。`;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    observations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string" },
          transcript: { type: "string" },
          audioIssue: { type: "string" },
          intelligibility: { type: "integer" },
          taskAchieved: { type: "string" },
          nonJapaneseRatio: { type: "integer" },
          grammarErrorCount: { type: "integer" },
          grammarErrorExamples: { type: "array", items: { type: "string" } },
          hesitationCount: { type: "integer" },
          vocabLevel: { type: "integer" },
          readingAccuracy: { type: "integer", nullable: true },
        },
        required: [
          "key",
          "transcript",
          "audioIssue",
          "intelligibility",
          "taskAchieved",
          "nonJapaneseRatio",
          "grammarErrorCount",
          "hesitationCount",
          "vocabLevel",
        ],
      },
    },
  },
  required: ["observations"],
} as const;

function toAudioIssue(v: unknown): ObservedFact["audioIssue"] {
  const s = String(v ?? "none");
  return s === "silent" || s === "too_short" || s === "unintelligible" ? s : "none";
}

function toTaskAchieved(v: unknown): ObservedFact["taskAchieved"] {
  const s = String(v ?? "none");
  return s === "full" || s === "partial" ? s : "none";
}

function toInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.round(clamp(n, min, max));
}

/** Gemini に音声を渡して「事実」だけを観察させる */
async function observeRecordings(
  recordings: JapaneseCheckRecording[],
): Promise<Map<string, ObservedFact>> {
  const model = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";

  const parts: { text?: string; inlineData?: { mimeType: string; data: string } }[] = [
    { text: SYSTEM_PROMPT },
  ];
  for (const r of recordings) {
    const q = findJapaneseCheckQuestion(r.key);
    parts.push({
      text:
        `--- 録音 key="${r.key}" ---\n` +
        `設問: ${q?.prompt ?? ""}\n` +
        (q?.readAloud ? `音読課題の台本: ${q.readAloud}\n` : "音読課題ではない (自由回答)\n"),
    });
    parts.push({ inlineData: { mimeType: r.mimeType, data: r.base64 } });
  }
  parts.push({
    text: "すべての録音について、指定スキーマの JSON を 1 つだけ返してください。observations は各録音 1 件ずつです。",
  });

  const response = await generateContentRotating({
    model,
    contents: [{ role: "user", parts }],
    config: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA as unknown as Record<string, unknown>,
      // 事実の抽出なので揺らぎは最小にする
      temperature: 0,
    },
  });

  const text = response.text?.trim() ?? "";
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("Gemini の応答を JSON として解釈できませんでした");
    raw = JSON.parse(m[0]);
  }

  const list = Array.isArray(raw.observations) ? (raw.observations as unknown[]) : [];
  const map = new Map<string, ObservedFact>();
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const key = typeof o.key === "string" ? o.key : "";
    if (!key) continue;
    map.set(key, {
      key,
      transcript: typeof o.transcript === "string" ? o.transcript : "",
      audioIssue: toAudioIssue(o.audioIssue),
      intelligibility: toInt(o.intelligibility, 0, 100, 0),
      taskAchieved: toTaskAchieved(o.taskAchieved),
      nonJapaneseRatio: toInt(o.nonJapaneseRatio, 0, 100, 0),
      grammarErrorCount: toInt(o.grammarErrorCount, 0, 999, 0),
      grammarErrorExamples: Array.isArray(o.grammarErrorExamples)
        ? (o.grammarErrorExamples as unknown[]).map((s) => String(s)).slice(0, 3)
        : [],
      hesitationCount: toInt(o.hesitationCount, 0, 999, 0),
      vocabLevel: toInt(o.vocabLevel, 1, 5, 1),
      readingAccuracy:
        o.readingAccuracy === null || o.readingAccuracy === undefined
          ? null
          : toInt(o.readingAccuracy, 0, 100, 0),
    });
  }
  return map;
}

/** レベルに応じた実務での目安 (面接官向け) */
function practicalNote(level: string): string {
  switch (level) {
    case "N1 相当":
      return "接客・電話対応を含め、日本語での業務に支障は見られません。";
    case "N2 相当":
      return "現場の指示・報告は問題なく、接客もある程度任せられます。";
    case "N3 相当":
      return "現場の指示と報告は概ね可能。接客や電話は練習が必要です。";
    case "N4 相当":
      return "定型的な指示なら通じます。製造・農業など指示が決まった現場向きで、複雑な説明には補助が要ります。";
    case "N5 相当":
      return "単語中心のやりとりです。やさしい日本語や図解での指示が必要です。";
    default:
      return "業務指示には通訳または母国語話者の補助が必要です。";
  }
}

/**
 * 観察された事実からレベルとスコアを決める純粋関数 (AI 呼び出しなし)。
 *
 * ここを分離しているのは、判定ルールを AI と切り離して単体で検証できるようにするため。
 * 同じ入力からは必ず同じ結果が出る。
 */
export function scoreFromObservations(
  observations: (ObservedFact & { seconds?: number | null })[],
): JapaneseCheckResult {
  // ── 事実 + 派生値を問ごとに組み立てる ──
  const perQuestion: JapaneseCheckPerQuestion[] = observations.map((fact) => {
    const q = findJapaneseCheckQuestion(fact.key);
    const mora = estimateMora(fact.transcript);
    const seconds = typeof fact.seconds === "number" && fact.seconds > 0 ? fact.seconds : null;
    return {
      ...fact,
      question: q?.prompt ?? fact.key,
      focus: q?.focus ?? "",
      mora,
      seconds,
      moraPerSec: seconds && mora > 0 ? Number((mora / seconds).toFixed(2)) : null,
      // 無音・短すぎ・聞き取れない録音は判定の材料にしない
      usable: fact.audioIssue === "none" && mora > 0,
    };
  });

  const usable = perQuestion.filter((p) => p.usable);
  const appliedRules: string[] = [];

  // ── 証拠が足りない場合は「判定不可」で止める (それらしい数字を作らない) ──
  if (usable.length < SCORING.minUsableForJudgement) {
    const reason =
      `判定に使える録音が ${usable.length} 件しかありません` +
      `（無音・短すぎ・聞き取れないものは除外）。証拠が不足しているため判定できません。`;
    return {
      estimatedLevel: "判定不可",
      pronunciation: 1,
      fluency: 1,
      vocabulary: 1,
      grammar: 1,
      summary: `${reason} 録音し直しを依頼してください。`,
      levelReason: reason,
      confidence: "低",
      evidence: {
        perQuestion,
        metrics: {
          usableCount: usable.length,
          totalQuestions: perQuestion.length,
          intelligibilityAvg: Math.round(mean(usable.map((p) => p.intelligibility))),
          readingAccuracy: null,
          freeMoraTotal: 0,
          moraPerSecAvg: null,
          grammarErrorPer100Mora: null,
          hesitationPer100Mora: null,
          nonJapaneseRatioAvg: 0,
          achievementRate: 0,
          composite: 0,
        },
        appliedRules: ["証拠不足のため判定不可"],
      },
      transcripts: perQuestion.map((p) => ({ key: p.key, transcript: p.transcript })),
    };
  }

  // 自由発話の問 (音読以外)。文を作る力はここだけで測る
  const free = usable.filter((p) => p.key !== "read_aloud");
  const readAloud = usable.find((p) => p.key === "read_aloud") ?? null;

  // ── 指標の集計 ──
  const intelligibilityAvg = mean(usable.map((p) => p.intelligibility));
  const readingAccuracy = readAloud?.readingAccuracy ?? null;
  const freeMoraTotal = free.reduce((a, p) => a + p.mora, 0);
  const rates = free.map((p) => p.moraPerSec).filter((v): v is number => v != null);
  const moraPerSecAvg = rates.length > 0 ? Number(mean(rates).toFixed(2)) : null;
  const grammarErrorTotal = free.reduce((a, p) => a + p.grammarErrorCount, 0);
  const hesitationTotal = free.reduce((a, p) => a + p.hesitationCount, 0);
  const grammarErrorPer100Mora =
    freeMoraTotal > 0 ? Number(((grammarErrorTotal / freeMoraTotal) * 100).toFixed(1)) : null;
  const hesitationPer100Mora =
    freeMoraTotal > 0 ? Number(((hesitationTotal / freeMoraTotal) * 100).toFixed(1)) : null;
  const nonJapaneseRatioAvg = Math.round(mean(usable.map((p) => p.nonJapaneseRatio)));

  // 課題達成率: 自由発話の問で「質問に答えられたか」
  const achievementBase = free.length > 0 ? free : usable;
  const achievementRate = Number(
    mean(
      achievementBase.map((p) =>
        p.taskAchieved === "full" ? 1 : p.taskAchieved === "partial" ? 0.5 : 0,
      ),
    ).toFixed(2),
  );

  // ── 4 観点のスコア (すべてルールで決定) ──

  // 発音: 聞き取れた割合。音読があれば台本どおり読めた割合と半々で合成する
  const pronunciationRaw =
    readingAccuracy != null ? 0.5 * intelligibilityAvg + 0.5 * readingAccuracy : intelligibilityAvg;
  const pronunciation = bandDesc(pronunciationRaw, SCORING.pronunciationBands);

  // 流暢さ: 話す速さ (拍/秒) を基準に、言い淀みの多さで減点
  let fluency: number;
  if (moraPerSecAvg != null) {
    fluency = bandDesc(moraPerSecAvg, SCORING.fluencyRateBands);
  } else {
    // 録音長が取れない旧データ: 発話量から代替推定 (期待量に対する比)
    const expected = free.reduce(
      (a, p) => a + (findJapaneseCheckQuestion(p.key)?.expectedMora ?? 40),
      0,
    );
    const ratio = expected > 0 ? freeMoraTotal / expected : 0;
    fluency = bandDesc(ratio, [1.0, 0.75, 0.5, 0.25]);
    appliedRules.push("録音の長さが無いため、発話量から流暢さを代替推定");
  }
  if (hesitationPer100Mora != null) {
    if (hesitationPer100Mora > SCORING.hesitationPenalty2) {
      fluency -= 2;
      appliedRules.push(
        `言い淀みが多い (100拍あたり ${hesitationPer100Mora} 回) ため流暢さを 2 段階下げた`,
      );
    } else if (hesitationPer100Mora > SCORING.hesitationPenalty1) {
      fluency -= 1;
      appliedRules.push(
        `言い淀みがやや多い (100拍あたり ${hesitationPer100Mora} 回) ため流暢さを 1 段階下げた`,
      );
    }
  }
  fluency = clamp(fluency, 1, 5);

  // 語彙: 4 観点で唯一 AI の判断を使う軸。
  // 語彙の広さは文字起こしからは数えられないため、アンカー付きの水準判定を平均する。
  let vocabulary = Math.round(mean(free.length > 0 ? free.map((p) => p.vocabLevel) : usable.map((p) => p.vocabLevel)));
  if (freeMoraTotal < SCORING.minFreeMoraForFullJudgement) {
    vocabulary = Math.min(vocabulary, 3);
    appliedRules.push(
      `自由発話が ${freeMoraTotal} 拍と少ないため、語彙は 3 を上限とした (判断材料が不足)`,
    );
  }
  vocabulary = clamp(vocabulary, 1, 5);

  // 文法: 100 拍あたりの誤りの数
  let grammar: number;
  if (grammarErrorPer100Mora != null) {
    grammar = bandAsc(grammarErrorPer100Mora, SCORING.grammarErrorBands);
  } else {
    grammar = 1;
    appliedRules.push("自由発話が無いため文法は評価できず最低値とした");
  }
  grammar = clamp(grammar, 1, 5);

  // ── 総合点 → レベル ──
  const composite = Number(
    (
      pronunciation * SCORING.weights.pronunciation +
      fluency * SCORING.weights.fluency +
      vocabulary * SCORING.weights.vocabulary +
      grammar * SCORING.weights.grammar
    ).toFixed(2),
  );

  let level = "日本語ほぼ不可";
  for (const row of SCORING.levels) {
    if (composite >= row.composite && achievementRate >= row.achievement) {
      level = row.level;
      break;
    }
  }
  const baseLevel = level;

  // ── 上限規則: 総合点が高くても、決定的な弱点があれば頭打ちにする ──
  const workScenario = perQuestion.find((p) => p.key === "work_scenario");
  if (workScenario?.usable && workScenario.taskAchieved === "none") {
    const capped = capLevel(level, "N4 相当");
    if (capped !== level) {
      appliedRules.push("仕事の場面の設問に答えられていないため N4 相当を上限とした");
      level = capped;
    }
  }
  const explain = perQuestion.find((p) => p.key === "explain_past");
  if (!explain?.usable || (explain?.mora ?? 0) < 25) {
    const capped = capLevel(level, "N3 相当");
    if (capped !== level) {
      appliedRules.push("長めの説明ができた証拠が無いため N3 相当を上限とした");
      level = capped;
    }
  }
  if (nonJapaneseRatioAvg > 25) {
    const capped = capLevel(level, "N4 相当");
    if (capped !== level) {
      appliedRules.push(
        `日本語以外での発話が平均 ${nonJapaneseRatioAvg}% あるため N4 相当を上限とした`,
      );
      level = capped;
    }
  }
  if (freeMoraTotal < SCORING.minFreeMoraForFullJudgement) {
    const capped = capLevel(level, "N4 相当");
    if (capped !== level) {
      appliedRules.push(
        `自由発話の総量が ${freeMoraTotal} 拍と少なく上位レベルの証拠が無いため N4 相当を上限とした`,
      );
      level = capped;
    }
  }

  const confidence: JapaneseCheckResult["confidence"] =
    usable.length >= 5 ? "高" : usable.length >= 3 ? "中" : "低";

  // ── 根拠テキスト (ルールの足あと) ──
  const reasonParts = [
    `使えた録音 ${usable.length}/${perQuestion.length} 件`,
    `聞き取れた割合 平均 ${Math.round(intelligibilityAvg)}%`,
    readingAccuracy != null ? `音読の正確さ ${readingAccuracy}%` : null,
    moraPerSecAvg != null ? `話す速さ ${moraPerSecAvg} 拍/秒` : null,
    `自由発話 ${freeMoraTotal} 拍`,
    grammarErrorPer100Mora != null ? `文法の誤り 100拍あたり ${grammarErrorPer100Mora} 回` : null,
    `設問に答えられた割合 ${Math.round(achievementRate * 100)}%`,
  ].filter(Boolean);
  const levelReason =
    `${reasonParts.join(" / ")} → 発音${pronunciation}・流暢さ${fluency}・語彙${vocabulary}・文法${grammar}` +
    `（重みづけ総合 ${composite}）から ${baseLevel}` +
    (baseLevel !== level ? `、上限規則により ${level} に調整` : "") +
    "。";

  const summary =
    `${level}（確からしさ: ${confidence}）。${practicalNote(level)}` +
    ` 根拠: ${reasonParts.slice(0, 4).join("、")}。` +
    " ※設問は画面に文字で示しているため、これは読んで理解し話す力の測定で、電話のような聴解力は含みません。";

  return {
    estimatedLevel: level,
    pronunciation,
    fluency,
    vocabulary,
    grammar,
    summary,
    levelReason,
    confidence,
    evidence: {
      perQuestion,
      metrics: {
        usableCount: usable.length,
        totalQuestions: perQuestion.length,
        intelligibilityAvg: Math.round(intelligibilityAvg),
        readingAccuracy,
        freeMoraTotal,
        moraPerSecAvg,
        grammarErrorPer100Mora,
        hesitationPer100Mora,
        nonJapaneseRatioAvg,
        achievementRate,
        composite,
      },
      appliedRules,
    },
    transcripts: perQuestion.map((p) => ({ key: p.key, transcript: p.transcript })),
  };
}

/**
 * 録音音声から日本語能力を判定する。
 * AI は事実の観察のみ (observeRecordings)、
 * レベルとスコアは明文ルール (scoreFromObservations) が決める。
 */
export async function judgeJapaneseFromAudio(
  recordings: JapaneseCheckRecording[],
): Promise<JapaneseCheckResult> {
  const usableInput = recordings.filter((r) => isSupportedAudio(r.mimeType) && r.base64);
  if (usableInput.length === 0) throw new Error("判定できる音声がありません");

  const observed = await observeRecordings(usableInput);

  // AI が返さなかった問は「聞き取れなかった」として扱い、勝手に補完しない
  const facts: (ObservedFact & { seconds?: number | null })[] = usableInput.map((r) => {
    const fact: ObservedFact = observed.get(r.key) ?? {
      key: r.key,
      transcript: "",
      audioIssue: "unintelligible",
      intelligibility: 0,
      taskAchieved: "none",
      nonJapaneseRatio: 0,
      grammarErrorCount: 0,
      grammarErrorExamples: [],
      hesitationCount: 0,
      vocabLevel: 1,
      readingAccuracy: null,
    };
    return { ...fact, seconds: r.seconds ?? null };
  });

  return scoreFromObservations(facts);
}
