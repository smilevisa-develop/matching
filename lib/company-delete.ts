/**
 * 企業の削除 (システム・企業データベースのスプシ・Drive をまとめて)。
 *
 * システムとスプシは双方向に同期しているので、片方だけ消すと次の同期でもう片方から戻ってくる
 * (スプシにだけある企業はシステムに作られ、システムにだけある企業はスプシに書かれる)。
 * そのため企業を消すときは、次をまとめて消す:
 *   - スプシ「企業マスタ」のその企業IDの行
 *   - スプシ「案件管理」「条件マスタ」のその企業の求人 (案件ID) の行
 *   - システムの企業 (求人・カンバンの紐づけも一緒に消える。請求は求人との紐づけだけ外れて残る)
 *   - 中身が空なら Drive の企業フォルダ (ゴミ箱へ。30 日以内なら戻せる)
 */

import { prisma } from "@/lib/prisma";
import { getSheetsClient } from "@/lib/sheets-sync";
import { resolveCompanyMasterSpreadsheetId } from "@/lib/company-master-sync";
import { COMPANY_MASTER_TAB, DEAL_SHEET_TAB } from "@/lib/deal-sheet-sync";
import { parseGoogleDriveFolderId, trashFolderIfEmpty } from "@/lib/google-docs";

const CONDITION_TAB = "条件マスタ";

export type SheetRowRef = { tab: string; row: number; values: string[] };

/** 見出し行と、キー列の位置を探す (見出しが 1 行目に無いシートもあるため数行見る) */
function findKeyColumn(rows: string[][], tab: string): { headerRow: number; col: number } | null {
  for (let r = 0; r < Math.min(rows.length, 5); r++) {
    const row = rows[r].map((v) => String(v ?? "").trim());
    if (tab === COMPANY_MASTER_TAB) {
      // 企業マスタの企業ID列は見出しが「企業ID」でないことがあるので、「企業名」の 1 つ左を使う
      const name = row.indexOf("企業名");
      if (name > 0) return { headerRow: r, col: name - 1 };
    } else {
      const id = row.indexOf("案件ID");
      if (id >= 0) return { headerRow: r, col: id };
    }
  }
  return null;
}

/** 消す対象のスプシの行を探す (消さない) */
export async function findCompanySheetRows(companyId: number): Promise<SheetRowRef[]> {
  const company = await prisma.company.findUniqueOrThrow({
    where: { id: companyId },
    select: { externalId: true, deals: { select: { sheetDealNo: true } } },
  });
  const spreadsheetId = resolveCompanyMasterSpreadsheetId();
  if (!spreadsheetId) return [];
  const sheets = await getSheetsClient();
  const externalId = (company.externalId ?? "").trim().toLowerCase();
  const dealNos = new Set(company.deals.map((d) => (d.sheetDealNo ?? "").trim()).filter(Boolean));

  const out: SheetRowRef[] = [];
  for (const tab of [COMPANY_MASTER_TAB, DEAL_SHEET_TAB, CONDITION_TAB]) {
    const res = await sheets.spreadsheets.values
      .get({ spreadsheetId, range: `'${tab}'` })
      .catch(() => null);
    const rows = (res?.data.values ?? []) as string[][];
    const key = findKeyColumn(rows, tab);
    if (!key) continue;
    rows.forEach((row, r) => {
      if (r <= key.headerRow) return;
      const v = String(row[key.col] ?? "").trim();
      const hit = tab === COMPANY_MASTER_TAB ? externalId && v.toLowerCase() === externalId : dealNos.has(v);
      if (hit) out.push({ tab, row: r + 1, values: row.map(String) });
    });
  }
  return out;
}

/** スプシの行を消す (下の行から順に消すので、行番号がずれない) */
export async function deleteSheetRows(refs: SheetRowRef[]): Promise<void> {
  if (refs.length === 0) return;
  const spreadsheetId = resolveCompanyMasterSpreadsheetId();
  if (!spreadsheetId) return;
  const sheets = await getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties(sheetId,title)" });
  const sheetIdOf = (tab: string) => meta.data.sheets?.find((s) => s.properties?.title === tab)?.properties?.sheetId;
  const requests = [...refs]
    .sort((a, b) => (a.tab === b.tab ? b.row - a.row : a.tab.localeCompare(b.tab)))
    .map((ref) => ({
      deleteDimension: {
        range: { sheetId: sheetIdOf(ref.tab), dimension: "ROWS", startIndex: ref.row - 1, endIndex: ref.row },
      },
    }));
  await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
}

export async function deleteCompanyEverywhere(companyId: number) {
  const company = await prisma.company.findUniqueOrThrow({
    where: { id: companyId },
    select: { name: true, driveFolderUrl: true },
  });
  // スプシを先に消す (システムだけ消えてスプシが残ると、次の同期で企業が作り直されるため)
  const rows = await findCompanySheetRows(companyId);
  await deleteSheetRows(rows);
  await prisma.company.delete({ where: { id: companyId } });

  let folderTrashed = false;
  const folderId = company.driveFolderUrl ? parseGoogleDriveFolderId(company.driveFolderUrl) : null;
  // 同じフォルダを他の企業が使っていなければ、空のときだけゴミ箱へ
  if (folderId && !(await prisma.company.count({ where: { driveFolderUrl: { contains: folderId } } }))) {
    folderTrashed = await trashFolderIfEmpty(folderId).catch(() => false);
  }
  return { name: company.name, sheetRows: rows, folderTrashed };
}
