/**
 * 公開アクセス可能な絶対 URL を組み立てるヘルパー。
 *
 * 主な用途:
 *   - LINE / Messenger / WhatsApp の image message に渡す originalContentUrl
 *   - メール本文に貼る公開 URL
 *
 * 解決順:
 *   1. PUBLIC_BASE_URL 環境変数 (例: "https://matching.up.railway.app")
 *   2. RAILWAY_PUBLIC_DOMAIN 環境変数 (Railway が自動で設定)
 *   3. デフォルト: "https://matching.up.railway.app"
 *
 * 注意: ホストヘッダから組み立てる方法は host header injection 攻撃の余地があり、
 *      かつ background job からは Request が無いので、env からのみ解決する。
 */

const FALLBACK_HOST = "matching.up.railway.app";

export function getPublicBaseUrl(): string {
  const explicit = process.env.PUBLIC_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, ""); // 末尾の / を削除

  const railway = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
  if (railway) {
    return `https://${railway.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
  }

  return `https://${FALLBACK_HOST}`;
}

/** 公開 URL + パスを組み合わせて絶対 URL を返す */
export function publicUrl(path: string): string {
  const base = getPublicBaseUrl();
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalized}`;
}
