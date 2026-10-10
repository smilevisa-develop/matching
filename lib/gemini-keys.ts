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

/**
 * 既定のモデル。
 *
 * 2026/10: 新しく発行した API キー (AQ.Ab8… 形式) では gemini-2.5-flash が
 *   「This model is no longer available to new users」= 404 になる。
 *   キーを切り替えた瞬間に AI 取込が 404 で落ちていたのはこれが原因。
 *   どのキーでも使えて、かつ無料枠がある gemini-3.8-flash を既定にする。
 * 無料枠を外れないこと (課金ゼロ) が前提のため、ここは無料枠のあるモデルだけにする。
 */
export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";

/**
 * 404 (そのキーでは使えないモデル) のときに順に試すモデル。
 * 古いキーしか無い環境でも動くよう、旧モデルを後ろに残している。
 */
export const GEMINI_MODEL_FALLBACKS = ["gemini-3.8-flash", "gemini-2.5-flash"];

/** 使うモデル名 (GEMINI_MODEL 優先) */
export function getGeminiModel(): string {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
}

/** 指定モデルの次に試すモデル (無ければ null) */
function nextModel(current: string, tried: Set<string>): string | null {
  return GEMINI_MODEL_FALLBACKS.find((m) => m !== current && !tried.has(m)) ?? null;
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

/** 503 / 混雑 系のエラーか (=一時的なので次のキーで再試行する対象) */
function isUnavailableError(e: unknown): boolean {
  const status = (e as { status?: number })?.status;
  const msg = String((e as { message?: string })?.message ?? e).toUpperCase();
  return (
    status === 503 ||
    /\b503\b/.test(msg) ||
    msg.includes("UNAVAILABLE") ||
    msg.includes("OVERLOADED") ||
    msg.includes("HIGH DEMAND")
  );
}

type GenParams = Parameters<GoogleGenAI["models"]["generateContent"]>[0];
type GenResult = Awaited<ReturnType<GoogleGenAI["models"]["generateContent"]>>;

/**
 * generateContent を実行。429/枠超過 または 503/混雑 が出たら次のキー (別プロジェクト) へ順に切り替える。
 * 全キーが枯渇したら最後のエラーを投げる。
 *
 * opts.keys を渡すと、そのキーだけを使う (候補者が直接使う公開機能の無料枠を、
 * 社内の AI 取込と分けたいとき用)。
 */
export async function generateContentRotating(
  params: GenParams,
  opts?: { keys?: string[] },
): Promise<GenResult> {
  const keys = opts?.keys?.length ? opts.keys : getGeminiKeys();
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
      if (isUnavailableError(e) && i < keys.length - 1) {
        console.warn(`[gemini] key #${i + 1} で混雑 (503)。次のキーで再試行します。`);
        continue;
      }
      // そのキーでは使えないモデル (404)。設定ミスやモデルの提供終了で
      // 機能ごと止まらないよう、別のモデルに切り替えて試す。
      if (isModelNotFoundError(e)) {
        const tried = new Set<string>([String(params.model)]);
        let alt = nextModel(String(params.model), tried);
        while (alt) {
          console.warn(
            `[gemini] key #${i + 1} ではモデル "${params.model}" が使えません (404)。${alt} で再試行します。`,
          );
          try {
            const client = new GoogleGenAI({ apiKey: keys[i] });
            return await client.models.generateContent({ ...params, model: alt });
          } catch (fallbackError) {
            lastErr = fallbackError;
            if (!isModelNotFoundError(fallbackError)) break;
            tried.add(alt);
            alt = nextModel(String(params.model), tried);
          }
        }
      }
      throw e;
    }
  }
  throw lastErr;
}
