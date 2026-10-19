/**
 * カンバンでステージを動かしたときに入力した日付を、企業データベース (スプシ) に反映する。
 *
 * 採用チームの依頼 (2026/10):
 *   事前面談済み → 「請求管理」タブの 事前面談日
 *   面接済み     → 「請求管理」タブの 企業面接日
 *   内定済み     → 「内定者管理」タブの 内定日 (行が無ければ候補者IDと一緒に追記)
 *   内定承諾     → 「内定者管理」タブの 内定承諾日
 *
 * 行は A 列の候補者ID (4 桁ゼロ埋め。例 0277) で探す。
 * 列は見出し行の文字で探す (列の位置が変わっても追従する)。見出しが無ければ何もしない。
 * 内定者管理に追記するとき、直前の行と内定日の月が変わっていれば「N月」の区切り行を 1 行入れる
 * (月ごとに見やすくするため。既存の 8月 / 9月 の行と同じ置き方)。
 */

import { resolveCompanyMasterSpreadsheetId } from "@/lib/company-master-sync";
import { getSheetsClient } from "@/lib/sheets-sync";

export const BILLING_SHEET_TAB = "請求管理";
export const OFFER_SHEET_TAB = "内定者管理";

type Target = { tab: string; header: string; appendIfMissing: boolean };

/** ステージ → 書く先 */
const STAGE_TARGETS: Record<string, Target> = {
  事前面談済み: { tab: BILLING_SHEET_TAB, header: "事前面談日", appendIfMissing: false },
  面接済み: { tab: BILLING_SHEET_TAB, header: "企業面接日", appendIfMissing: false },
  内定済み: { tab: OFFER_SHEET_TAB, header: "内定日", appendIfMissing: true },
  内定承諾: { tab: OFFER_SHEET_TAB, header: "内定承諾日", appendIfMissing: true },
};

export type StageDateSheetResult =
  | { ok: true; tab: string; row: number; column: string; appended: boolean }
  | { ok: false; skipped: string };

const quote = (name: string) => `'${name.replace(/'/g, "''")}'`;
const colLetter = (i: number) => {
  let s = "";
  let n = i;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
};

/** 候補者ID の表記 (スプシは 4 桁ゼロ埋め) */
export function sheetPersonId(personId: number): string {
  return String(personId).padStart(4, "0");
}

/** "YYYY-MM-DD" → スプシの日付表記 "YYYY/MM/DD" */
function toSheetYmd(ymd: string): string {
  return ymd.replace(/-/g, "/");
}

/**
 * 1 件反映する。失敗は投げずに結果で返す (呼び出し元は after() で待たせない)。
 */
export async function writeStageDateToSheet(args: {
  personId: number;
  stage: string;
  date: string; // YYYY-MM-DD
}): Promise<StageDateSheetResult> {
  const target = STAGE_TARGETS[args.stage];
  if (!target) return { ok: false, skipped: `ステージ「${args.stage}」はスプシに書かない` };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) return { ok: false, skipped: "日付の形式が不正" };

  const spreadsheetId = resolveCompanyMasterSpreadsheetId();
  if (!spreadsheetId) return { ok: false, skipped: "企業データベースのスプシIDが未設定" };
  const sheets = await getSheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${quote(target.tab)}!A1:AZ2000`,
  });
  const rows = (res.data.values ?? []).map((r) => r.map((c) => String(c ?? "")));

  // 見出し行 = 目的の見出しを含む最初の行 (上から 10 行以内)
  let headerRow = -1;
  let col = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const j = rows[i].findIndex((c) => c.trim() === target.header);
    if (j >= 0) {
      headerRow = i;
      col = j;
      break;
    }
  }
  if (headerRow < 0) return { ok: false, skipped: `「${target.tab}」に見出し「${target.header}」が無い` };

  const id = sheetPersonId(args.personId);
  const idNum = String(args.personId);
  let row = -1;
  for (let i = headerRow + 1; i < rows.length; i++) {
    const a = (rows[i][0] ?? "").trim();
    if (a === id || a === idNum) {
      row = i;
      break;
    }
  }

  let appended = false;
  if (row < 0) {
    if (!target.appendIfMissing) return { ok: false, skipped: `「${target.tab}」に候補者 ${id} の行が無い` };

    // 最後にデータが入っている行 (A 列か日付列に何かある行) の次に追記する
    let last = headerRow;
    for (let i = headerRow + 1; i < rows.length; i++) {
      if ((rows[i][0] ?? "").trim() || (rows[i][col] ?? "").trim()) last = i;
    }
    const prevDate = (rows[last]?.[col] ?? "").trim();
    const prevMonth = prevDate.match(/^(\d{4})[/-](\d{2})/);
    const [y, m] = args.date.split("-");
    const monthChanged = prevMonth ? !(prevMonth[1] === y && prevMonth[2] === m) : false;
    const values: string[][] = [];
    if (monthChanged) values.push([`${Number(m)}月`]);
    values.push([id]);
    const startRow = last + 2; // 1 始まり
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${quote(target.tab)}!A${startRow}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values },
    });
    row = last + values.length; // 0 始まり index の追記行
    appended = true;
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${quote(target.tab)}!${colLetter(col)}${row + 1}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[toSheetYmd(args.date)]] },
  });
  return { ok: true, tab: target.tab, row: row + 1, column: colLetter(col), appended };
}
