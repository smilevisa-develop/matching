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
 * 設定ミスで AI 取込が丸ごと止まらないよう、404 のときは別のモデルで試す (quotaFallbackModels)。
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
 * 1 日の無料枠を使い切ったときに切り替えるモデル。
 * 無料枠は「プロジェクト × モデル」ごとに別枠なので、別モデルに逃がすとその日も使い続けられる。
 * そのキーで使えないモデル (404) は自動で飛ばす。GEMINI_QUOTA_FALLBACK_MODELS で上書きできる。
 */
const DEFAULT_QUOTA_FALLBACK_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.8-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
];

function quotaFallbackModels(first: string): string[] {
  const raw = process.env.GEMINI_QUOTA_FALLBACK_MODELS?.trim();
  const list = raw ? raw.split(",").map((m) => m.trim()).filter(Boolean) : DEFAULT_QUOTA_FALLBACK_MODELS;
  return [...new Set([first, ...list])];
}

/**
 * 枠切れ・使えないと分かった「キー × モデル」と、使えるようになる時刻。
 * 次の依頼で同じキーを叩きにいかないための覚え書き (プロセス内だけ。再起動で消えてよい)。
 */
const blockedUntil = new Map<string, number>();
const slot = (key: string, model: string) => `${key}::${model}`;

/** 「Please retry in 19h58m37.4s」から待ち時間 (ミリ秒) を読む。読めなければ null */
function retryDelayMs(e: unknown): number | null {
  const msg = String((e as { message?: string })?.message ?? e);
  const m = msg.match(/retry in (?:(\d+)h)?(?:(\d+)m)?(?:([\d.]+)s)?/i);
  if (!m || (!m[1] && !m[2] && !m[3])) return null;
  return ((Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0)) * 60 + Number(m[3] ?? 0)) * 1000;
}

/** 全キー・全モデルで枠を使い切ったときのエラー。画面にそのまま出せる文面にしている */
export class GeminiQuotaExhaustedError extends Error {
  status = 429;
  constructor(public readonly availableAt: Date | null) {
    const when = availableAt
      ? availableAt.toLocaleString("ja-JP", {
          timeZone: "Asia/Tokyo",
          month: "numeric",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      : null;
    super(
      when
        ? `AI (Gemini) の今日の無料枠を使い切りました。${when} ごろから再び使えます。`
        : "AI (Gemini) の無料枠を使い切りました。しばらく時間を置いてからお試しください。",
    );
    this.name = "GeminiQuotaExhaustedError";
  }
}

/**
 * generateContent を実行。
 *   429/枠超過 → 次のキー (別プロジェクト=別枠) へ
 *   全キーで枠切れ → 別モデル (モデルごとに別枠) へ
 *   503/混雑 → 次のキーで再試行
 *   404 (そのキーで使えないモデル) → 別モデルへ
 * 枠切れのキーは回復時刻まで覚えておき、次の依頼では叩かない。
 * どこも使えなければ GeminiQuotaExhaustedError (回復時刻つき) を投げる。
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

  let lastErr: unknown = null;
  let quotaOnly = true;
  let earliestRecovery: number | null = null;
  const noteRecovery = (until: number) => {
    earliestRecovery = earliestRecovery === null ? until : Math.min(earliestRecovery, until);
  };

  for (const model of quotaFallbackModels(String(params.model))) {
    for (let i = 0; i < keys.length; i++) {
      const until = blockedUntil.get(slot(keys[i], model));
      if (until && until > Date.now()) {
        noteRecovery(until);
        continue;
      }
      try {
        const client = new GoogleGenAI({ apiKey: keys[i] });
        const result = await client.models.generateContent({ ...params, model });
        if (model !== params.model) console.warn(`[gemini] 枠切れのため ${model} で処理しました。`);
        return result;
      } catch (e) {
        lastErr = e;
        if (isQuotaError(e)) {
          const delay = retryDelayMs(e);
          // 数分以上待てと言われたら、その日の枠切れとみなして回復まで使わない
          if (delay !== null && delay > 5 * 60_000) {
            blockedUntil.set(slot(keys[i], model), Date.now() + delay);
            noteRecovery(Date.now() + delay);
          }
          console.warn(`[gemini] key #${i + 1} / ${model} が枠超過。次へ切り替えます。`);
          continue;
        }
        if (isUnavailableError(e)) {
          quotaOnly = false;
          console.warn(`[gemini] key #${i + 1} / ${model} で混雑 (503)。次へ切り替えます。`);
          continue;
        }
        if (isModelNotFoundError(e)) {
          // そのキーでは使えないモデル。しばらく試さない
          blockedUntil.set(slot(keys[i], model), Date.now() + 24 * 3600_000);
          console.warn(`[gemini] key #${i + 1} ではモデル "${model}" が使えません (404)。`);
          continue;
        }
        throw e;
      }
    }
  }

  if (quotaOnly && (lastErr === null || isQuotaError(lastErr) || isModelNotFoundError(lastErr))) {
    throw new GeminiQuotaExhaustedError(earliestRecovery === null ? null : new Date(earliestRecovery));
  }
  throw lastErr;
}
