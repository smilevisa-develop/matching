/**
 * 企業データベース (スプシ) の「自動入力の列」を編集できないようにする (要ログイン)。
 *
 * GET  /api/admin/protect-sheet-columns?tab=案件管理   どの列が青見出し / 数式かを調べるだけ
 * POST /api/admin/protect-sheet-columns  { tab?: string, columns?: string[] }
 *      青見出し (= 関数で自動入力される) の列に「保護された範囲」を付ける。
 *      columns を渡すとその列だけ (例 ["C","D","E"])。渡さなければ青見出しを自動判定。
 *
 * 「警告のみ」の保護にする (2026/10/21 変更)。誰でも編集できるが、編集しようとすると警告が出る。
 * 完全なロック (編集者をサービスアカウントだけにする) にすると、フィルターが使えなくなったため。
 */

import { AuthError, requireApiAccount } from "@/lib/auth";
import { resolveCompanyMasterSpreadsheetId } from "@/lib/company-master-sync";
import { DEAL_SHEET_TAB } from "@/lib/deal-sheet-sync";
import { getSheetsClient } from "@/lib/sheets-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const colLetter = (i: number) => {
  let s = "";
  let n = i;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
};
const colIndex = (letter: string) => {
  let n = 0;
  for (const ch of letter.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

type ColumnInfo = {
  col: string;
  header: string;
  color: { r: number; g: number; b: number } | null;
  /** 見出しの色から判定: blue = 自動入力, red = 手入力, green = 人数, other */
  kind: "blue" | "red" | "green" | "other";
  hasFormula: boolean;
};

async function inspect(tab: string) {
  const spreadsheetId = resolveCompanyMasterSpreadsheetId();
  if (!spreadsheetId) throw new Error("企業データベースのスプレッドシート ID を解決できません");
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.get({
    spreadsheetId,
    ranges: [`'${tab}'!A1:Z3`],
    includeGridData: true,
    fields:
      "sheets(properties(sheetId,title,gridProperties(rowCount)),protectedRanges(protectedRangeId,description,range,warningOnly,editors),data(rowData(values(formattedValue,userEnteredValue,effectiveFormat(backgroundColor)))))",
  });
  const sheet = res.data.sheets?.[0];
  if (!sheet?.properties?.sheetId && sheet?.properties?.sheetId !== 0) throw new Error(`タブが見つかりません: ${tab}`);
  const rows = sheet.data?.[0]?.rowData ?? [];
  const header = rows[0]?.values ?? [];
  const sample = rows[1]?.values ?? [];
  const columns: ColumnInfo[] = header.map((cell, i) => {
    const bg = cell.effectiveFormat?.backgroundColor;
    const color = bg ? { r: bg.red ?? 0, g: bg.green ?? 0, b: bg.blue ?? 0 } : null;
    let kind: ColumnInfo["kind"] = "other";
    if (color) {
      if (color.b > 0.45 && color.b > color.r + 0.15 && color.b > color.g + 0.1) kind = "blue";
      else if (color.r > 0.55 && color.r > color.g + 0.2 && color.r > color.b + 0.2) kind = "red";
      else if (color.g > 0.35 && color.g > color.r + 0.1 && color.g > color.b + 0.1) kind = "green";
    }
    return {
      col: colLetter(i),
      header: cell.formattedValue ?? "",
      color,
      kind,
      hasFormula: Boolean(sample[i]?.userEnteredValue?.formulaValue),
    };
  });
  return {
    spreadsheetId,
    sheetId: sheet.properties!.sheetId!,
    rowCount: sheet.properties?.gridProperties?.rowCount ?? 1000,
    columns: columns.filter((c) => c.header),
    protectedRanges: (sheet.protectedRanges ?? []).map((p) => ({
      id: p.protectedRangeId,
      description: p.description,
      startCol: p.range?.startColumnIndex,
      endCol: p.range?.endColumnIndex,
      warningOnly: p.warningOnly,
      /** 編集できる人。空なら「編集者全員」= 制限なし */
      editors: p.editors?.users ?? [],
      domainUsersCanEdit: p.editors?.domainUsersCanEdit ?? null,
    })),
  };
}

export async function GET(req: Request) {
  try {
    await requireApiAccount();
    const tab = new URL(req.url).searchParams.get("tab") || DEAL_SHEET_TAB;
    const info = await inspect(tab);
    return Response.json({ ok: true, tab, ...info, blueColumns: info.columns.filter((c) => c.kind === "blue").map((c) => `${c.col} ${c.header}`) });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    await requireApiAccount();
    const body = await req.json().catch(() => ({}));
    const tab = typeof body?.tab === "string" && body.tab ? body.tab : DEAL_SHEET_TAB;
    const info = await inspect(tab);
    const targets = Array.isArray(body?.columns) && body.columns.length > 0
      ? (body.columns as string[]).map((c) => c.toUpperCase())
      : info.columns.filter((c) => c.kind === "blue").map((c) => c.col);
    if (targets.length === 0) {
      return Response.json({ ok: false, error: "保護する列が見つかりません (青い見出しの列が無い)" }, { status: 400 });
    }

    // 既に同じ列の保護があれば作り直す (二重にしない)
    const sheets = await getSheetsClient();
    const requests: Record<string, unknown>[] = [];
    for (const p of info.protectedRanges) {
      if (p.description?.startsWith("自動入力列") && p.id != null) {
        requests.push({ deleteProtectedRange: { protectedRangeId: p.id } });
      }
    }
    for (const col of targets) {
      const idx = colIndex(col);
      const header = info.columns.find((c) => c.col === col)?.header ?? col;
      requests.push({
        addProtectedRange: {
          protectedRange: {
            range: {
              sheetId: info.sheetId,
              startRowIndex: 1, // 見出し行は除く
              endRowIndex: info.rowCount,
              startColumnIndex: idx,
              endColumnIndex: idx + 1,
            },
            description: `自動入力列 (${col} ${header}) — 関数で入るため手で編集しない`,
            // 「警告のみ」: 誰でも編集できるが、編集しようとすると警告が出る。
            // 完全にロックすると、フィルターが使えなくなる (保護された列を含む表は編集できる人しか絞り込めない)ため (2026/10/21)
            warningOnly: true,
          },
        },
      });
    }
    await sheets.spreadsheets.batchUpdate({ spreadsheetId: info.spreadsheetId, requestBody: { requests } });
    return Response.json({ ok: true, tab, protected: targets });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 },
    );
  }
}
