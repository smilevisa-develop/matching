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
 *   GEMINI_MODEL    = 使うモデル名 (任意。未設定なら DEFAULT_GEMINI_MODEL)
 *
 * モデル名が古い / 存在しないと Google は 404 (NOT_FOUND) を返す。
 * 設定ミスで AI 取込が丸ごと止まらないよう、404 のときは既定モデルで 1 度だけやり直す。
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

/** 既定のモデル。GEMINI_MODEL 未設定時、および 404 時のフォールバック先 */
export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

/** 使うモデル名 (GEMINI_MODEL 優先) */
export function getGeminiModel(): string {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
}

/** モデルが見つからない (404 / NOT_FOUND) 系のエラーか */
function isModelNotFoundError(e: unknown): boolean {
  const status = (e as { status?: number })?.status;
  const msg = String((e as { message?: string })?.message ?? e).toUpperCase();
  return status === 404 || msg.includes("NOT_FOUND") || /\b404\b/.test(msg);
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
      // モデル名が存在しない (GEMINI_MODEL の設定ミス / モデルの提供終了) 場合は、
      // 既定モデルで 1 度だけやり直す。設定ミスで機能ごと止めないため。
      if (isModelNotFoundError(e) && params.model !== DEFAULT_GEMINI_MODEL) {
        console.warn(
          `[gemini] モデル "${params.model}" が見つかりません (404)。` +
            `既定の ${DEFAULT_GEMINI_MODEL} で再試行します。GEMINI_MODEL の設定を見直してください。`,
        );
        try {
          const client = new GoogleGenAI({ apiKey: keys[i] });
          return await client.models.generateContent({ ...params, model: DEFAULT_GEMINI_MODEL });
        } catch (fallbackError) {
          throw fallbackError;
        }
      }
      throw e;
    }
  }
  throw lastErr;
}
