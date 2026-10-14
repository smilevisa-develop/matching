/**
 * スプシへの同期を今すぐ実行する (要ログイン)。サイドバーの「同期」ボタンから呼ぶ。
 * 中身は毎時の cron (/api/cron/sync-sheet) と同じ。
 */

import { AuthError, requireApiAccount } from "@/lib/auth";
import { runFullSheetSync } from "@/lib/full-sheet-sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST() {
  try {
    await requireApiAccount();
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 },
    );
  }
  return runFullSheetSync();
}
