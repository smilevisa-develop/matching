/**
 * Gemini API キーの複数運用 (無料枠の束ね)。
 *
 * 無料枠の上限は「プロジェクト単位」(Google 公式)。別プロジェクトの API キーを複数用意し、
 * 429 / RESOURCE_EXHAUSTED が出たら次のキー (=別プロジェクト=別枠) へ自動で切り替える。
 * これで課金ゼロのまま、実質「プロジェクト数ぶん」の無料枠を使える。
 *
 * 環境変数:
 *   GEMINI_API_KEYS = key1,key2,key3   (カンマ区切り。別プロジェクトのキーを並べる)
 *   GEMINI_API_KEY  = 従来の単体キー    (後方互換。これも一覧に含める)
 */

import { GoogleGenAI } from "@google/genai";

/** 使える Gemini キー一覧 (GEMINI_API_KEYS を優先し GEMINI_API_KEY も足す・重複排除) */
export function getGeminiKeys(): string[] {
  const out: string[] = [];
  const multi = process.env.GEMINI_API_KEYS?.trim();
  if (multi) out.push(...multi.split(",").map((k) => k.trim()).filter(Boolean));
  const single = process.env.GEMINI_API_KEY?.trim();
  if (single) out.push(single);
  return [...new Set(out)];
}

/** 429 / 無料枠超過 系のエラーか (=次のキーに切り替える対象) */
function isQuotaError(e: unknown): boolean {
  const status = (e as { status?: number })?.status;
  const msg = String((e as { message?: string })?.message ?? e).toUpperCase();
  return (
    status === 429 ||
    msg.includes("429") ||
    msg.includes("RESOURCE_EXHAUSTED") ||
    msg.includes("QUOTA") ||
    msg.includes("RATE LIMIT")
  );
}

type GenParams = Parameters<GoogleGenAI["models"]["generateContent"]>[0];
type GenResult = Awaited<ReturnType<GoogleGenAI["models"]["generateContent"]>>;

/**
 * generateContent を実行。429/枠超過が出たら次のキー (別プロジェクト) へ順に切り替える。
 * 全キーが枯渇したら最後のエラーを投げる。
 */
export async function generateContentRotating(params: GenParams): Promise<GenResult> {
  const keys = getGeminiKeys();
  if (keys.length === 0) throw new Error("GEMINI_API_KEY(S) が未設定です");
  let lastErr: unknown;
  for (let i = 0; i < keys.length; i++) {
    try {
      const client = new GoogleGenAI({ apiKey: keys[i] });
      return await client.models.generateContent(params);
    } catch (e) {
      lastErr = e;
      if (isQuotaError(e) && i < keys.length - 1) {
        console.warn(`[gemini] key #${i + 1} が枠超過。次のキーへ切り替えます。`);
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}
