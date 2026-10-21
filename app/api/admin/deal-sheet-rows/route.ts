/**
 * 企業データベース (スプシ) の「案件管理」から、指定した 案件ID の行を消す (要ログイン)。
 *
 * 系で案件を統合・削除しても、スプシの行は同期では消さない (消してよいかは人が決める) ため、
 * 消すときはここから明示的に実行する。
 *
 * GET  /api/admin/deal-sheet-rows?dealNos=037,041   どの行が対象かを返すだけ (消さない)
 * POST /api/admin/deal-sheet-rows  { dealNos: ["037", "041"] }   実際に行を削除する
 *
 * 行は A 列 (案件ID) で探す。見つからない番号は skipped に入れる。下の行から順に消す (行番号がずれないように)。
 */

import { AuthError, requireApiAccount } from "@/lib/auth";
import { resolveCompanyMasterSpreadsheetId } from "@/lib/company-master-sync";
import { DEAL_SHEET_TAB } from "@/lib/deal-sheet-sync";
import { findSheetIdByName, getSheetsClient } from "@/lib/sheets-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseDealNos(v: unknown): string[] {
  const list = Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : [];
  return [...new Set(list.map((x) => String(x).trim()).filter((x) => /^\d+$/.test(x)).map((x) => String(Number(x))))];
}

async function plan(dealNos: string[]) {
  const spreadsheetId = resolveCompanyMasterSpreadsheetId();
  if (!spreadsheetId) throw new Error("企業データベースのスプシIDが未設定");
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `'${DEAL_SHEET_TAB}'!A1:I2000` });
  const rows = (res.data.values ?? []).map((r) => r.map((c) => String(c ?? "")));
  const targets: { dealNo: string; row: number; company: string; title: string }[] = [];
  const found = new Set<string>();
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i][0]?.trim();
    if (!a || !/^\d+(\.0+)?$/.test(a)) continue;
    const no = String(Number(a));
    if (dealNos.includes(no) && !found.has(no)) {
      found.add(no);
      targets.push({ dealNo: no.padStart(3, "0"), row: i + 1, company: rows[i][1] ?? "", title: rows[i][4] ?? "" });
    }
  }
  const skipped = dealNos.filter((n) => !found.has(n)).map((n) => n.padStart(3, "0"));
  return { spreadsheetId, sheets, targets, skipped };
}

export async function GET(req: Request) {
  try {
    await requireApiAccount();
    const dealNos = parseDealNos(new URL(req.url).searchParams.get("dealNos"));
    if (dealNos.length === 0) return Response.json({ ok: false, error: "dealNos を指定してください" }, { status: 400 });
    const { targets, skipped } = await plan(dealNos);
    return Response.json({ ok: true, tab: DEAL_SHEET_TAB, targets, skipped });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "error" }, { status: error instanceof AuthError ? error.status : 500 });
  }
}

export async function POST(req: Request) {
  try {
    await requireApiAccount();
    const body = await req.json().catch(() => ({}));
    const dealNos = parseDealNos(body?.dealNos);
    if (dealNos.length === 0) return Response.json({ ok: false, error: "dealNos を指定してください" }, { status: 400 });
    const { spreadsheetId, sheets, targets, skipped } = await plan(dealNos);
    if (targets.length > 0) {
      const sheetId = await findSheetIdByName(sheets, spreadsheetId, DEAL_SHEET_TAB);
      if (sheetId === null || sheetId === undefined) throw new Error(`「${DEAL_SHEET_TAB}」タブが見つかりません`);
      // 下の行から消す (上から消すと行番号がずれる)
      const requests = [...targets]
        .sort((a, b) => b.row - a.row)
        .map((t) => ({ deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: t.row - 1, endIndex: t.row } } }));
      await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
    }
    return Response.json({ ok: true, tab: DEAL_SHEET_TAB, deleted: targets, skipped });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "error" }, { status: error instanceof AuthError ? error.status : 500 });
  }
}
