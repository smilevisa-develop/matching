/**
 * DB シートの行レイアウトを診断し、取り残された候補者行を詰め直す。
 *
 * GET /api/admin/sheet-layout            ← 診断のみ (取り残し行を一覧)
 * GET /api/admin/sheet-layout?compact=1  ← 詰め直しのドライラン (移動計画を返す)
 * GET /api/admin/sheet-layout?compact=1&apply=1  ← 実行 (行を移動 + 元をクリア)
 *
 * 背景: Google Sheets の append は「データがある最後の行の次」に書くため、
 *       シート下部に取り残しデータがあると新規候補者がそこ (例 1005 行目) に
 *       飛んでしまう。このズレを検出・修復する。
 */

import { AuthError, requireApiAccount } from "@/lib/auth";
import {
  compactStrandedRows,
  inspectSheetLayout,
  parseSheetIdFromUrl,
  SYNC_SHEET_TAB_NAME,
} from "@/lib/sheets-sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: Request) {
  try {
    await requireApiAccount();
    const { searchParams } = new URL(req.url);
    const compact = searchParams.get("compact") === "1";
    const apply = searchParams.get("apply") === "1";
    const sheetName = searchParams.get("sheet") ?? SYNC_SHEET_TAB_NAME;

    const sheetUrl = process.env.SYNC_SHEET_URL?.trim();
    if (!sheetUrl) {
      return Response.json({ ok: false, error: "SYNC_SHEET_URL が未設定です" }, { status: 500 });
    }
    const spreadsheetId = parseSheetIdFromUrl(sheetUrl);
    if (!spreadsheetId) {
      return Response.json(
        { ok: false, error: `SYNC_SHEET_URL から Sheet ID を解析できません: ${sheetUrl}` },
        { status: 500 },
      );
    }

    if (compact) {
      const result = await compactStrandedRows({ spreadsheetId, sheetName, apply });
      return Response.json({ ok: true, mode: "compact", ...result });
    }

    const layout = await inspectSheetLayout({ spreadsheetId, sheetName });
    return Response.json({ ok: true, mode: "inspect", ...layout });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 },
    );
  }
}
