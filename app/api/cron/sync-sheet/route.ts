/**
 * スプシ全件同期を 1 時間ごとに走らせるための cron エンドポイント。
 *
 * Railway 側で Scheduled Job / GitHub Actions cron などから毎正時に叩く想定:
 *   GET /api/cron/sync-sheet
 *
 * 認証: Authorization: Bearer <CRON_SECRET> または ?secret=<CRON_SECRET>。
 *      本番 (NODE_ENV=production) では CRON_SECRET 必須。未設定なら 401 を返して実行しない。
 *      開発時のみ未設定で実行可。
 *      ※このパスは proxy.ts でログイン不要にしているため、ここが唯一の防御線。
 *
 * 動作: 系で変更があった候補者をスプシに反映し、続けて
 *      案件・企業を企業データベース(案件情報 / 企業マスタ)へ差分同期する。
 */

import { runFullSheetSync } from "@/lib/full-sheet-sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * 認証結果。
 *   ok        … 実行してよい
 *   reason    … 失敗理由 (ログ/レスポンス用)
 *
 * このパスは proxy.ts でログイン不要にしているため、
 * 本番では CRON_SECRET を必須にする (未設定なら実行させない)。
 */
function verifySecret(req: Request): { ok: boolean; reason?: string } {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return { ok: false, reason: "CRON_SECRET が未設定です (本番では必須)" };
    }
    return { ok: true }; // 開発時のみ認証スキップ
  }
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.replace(/^Bearer\s+/i, "");
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("secret");
  if (bearer === secret || q === secret) return { ok: true };
  return { ok: false, reason: "unauthorized" };
}

export async function GET(req: Request) {
  const auth = verifySecret(req);
  if (!auth.ok) {
    return Response.json({ ok: false, error: auth.reason ?? "unauthorized" }, { status: 401 });
  }

  return runFullSheetSync();
}
