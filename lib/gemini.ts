/**
 * 求人票パイプライン用の Gemini ラッパー。
 * 既存 lib/ai-extract.ts は写真+全部投げる方式なので別物として用意。
 *
 * 役割:
 * - セクション単位の小さなテキスト塊を「意味解釈」させて JSON で返してもらう
 * - OCR は行わせない (既に rawText がある前提)
 * - 不明値は null。推測禁止。コードブロックや説明は禁止。
 *
 * 失敗ハンドリング:
 * - 503 / 429 はリトライ (ai-extract と同じ思想)
 * - JSON parse 失敗時は null 返却 + raw を debug に渡す
 */

import { GoogleGenAI } from "@google/genai";

export const SECTION_PROMPT_HEADER = `あなたは帳票抽出器です。
出力は JSON のみ。コードブロックや説明文は禁止。
不明な値は null または空文字列。
推測禁止。提示されたセクションテキストの中だけから値を抜くこと。
セクション外の情報を使わない。
数値はできるだけ数値型で出すこと。
分からない値は null にすること。`;

export type GeminiSectionRequest<T> = {
  sectionName: string;
  text: string;
  schemaDescription: string;
  example?: Partial<T>;
};

export type GeminiSectionDebug = {
  sectionName: string;
  rawResponse: string;
  parsedOk: boolean;
  attempts: number;
  errorMessage?: string;
};

const MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";

function getClient() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY が未設定です");
  return new GoogleGenAI({ apiKey });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(message: string) {
  return /UNAVAILABLE|503|RESOURCE_EXHAUSTED|429|DEADLINE_EXCEEDED/.test(message);
}

/**
 * セクション単位で Gemini に投げて JSON で返してもらう。
 * 入力テキストが空なら API は呼ばずに `{}` を返す (節約)。
 */
export async function geminiExtractSection<T>({
  sectionName,
  text,
  schemaDescription,
  example,
}: GeminiSectionRequest<T>): Promise<{ data: T | null; debug: GeminiSectionDebug }> {
  if (!text || text.trim().length === 0) {
    return {
      data: null,
      debug: { sectionName, rawResponse: "", parsedOk: true, attempts: 0 },
    };
  }

  const prompt = [
    SECTION_PROMPT_HEADER,
    `\nセクション名: ${sectionName}`,
    `\n出力スキーマの説明:\n${schemaDescription}`,
    example ? `\n出力例 (形のみ):\n${JSON.stringify(example, null, 2)}` : "",
    `\nセクションテキスト:\n"""\n${text}\n"""`,
    "\n上記テキストから抜き出して JSON を 1 つだけ返してください。",
  ]
    .filter(Boolean)
    .join("\n");

  const client = getClient();
  let attempts = 0;
  let lastError = "";
  for (let i = 0; i < 3; i++) {
    attempts++;
    try {
      const response = await client.models.generateContent({
        model: MODEL,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { responseMimeType: "application/json", temperature: 0.1 },
      });
      const raw = response.text?.trim() ?? "";
      const parsed = parseJson<T>(raw);
      return {
        data: parsed,
        debug: {
          sectionName,
          rawResponse: raw,
          parsedOk: parsed !== null,
          attempts,
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      lastError = msg;
      console.error(`[gemini:${sectionName}] attempt ${attempts}: ${msg}`);
      if (!isRetryable(msg) || i === 2) break;
      await sleep(1500 * Math.pow(2, i));
    }
  }
  return {
    data: null,
    debug: {
      sectionName,
      rawResponse: "",
      parsedOk: false,
      attempts,
      errorMessage: lastError,
    },
  };
}

function parseJson<T>(raw: string): T | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}
