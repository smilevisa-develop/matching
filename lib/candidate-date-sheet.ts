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
 *
 * 内定者管理に行を足すときは、内定日の月の「N月」区切りの最後に行を差し込む (2026/10 採用チームの依頼:
 * 8・9 月の内定ならその月のところにはめ込み、月の流れが分かるように)。
 * その月の区切りが無ければ、月の順になる位置に区切り行ごと差し込む。
 * 差し込んだ行には、下の空き行 (B〜F 列の関数・M 列の「未」が入っている) をそのまま写す。
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
  /** true なら、セルに既に日付が入っているときは書かない (飛ばした段階の日付で手入力の実際の日付を消さないため) */
  onlyIfEmpty?: boolean;
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

    // 月の区切りの中に行を差し込む (関数入りの空き行を写す)
    const offerCol = rows[headerRow].findIndex((c) => c.trim() === "内定日");
    row = await insertOfferRow({
      sheets,
      spreadsheetId,
      tab: target.tab,
      rows,
      headerRow,
      dateCol: offerCol >= 0 ? offerCol : col,
      date: args.date,
      id,
    });
    appended = true;
  }

  if (args.onlyIfEmpty && !appended && (rows[row]?.[col] ?? "").trim()) {
    return { ok: false, skipped: `${target.tab} ${colLetter(col)}${row + 1} には既に「${rows[row][col]}」が入っている` };
  }
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${quote(target.tab)}!${colLetter(col)}${row + 1}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[toSheetYmd(args.date)]] },
  });
  return { ok: true, tab: target.tab, row: row + 1, column: colLetter(col), appended };
}

/** 日付列のセルを直接直す (取り直しで誤って上書きした値を戻す用)。請求管理 / 内定者管理 の日付列だけ */
export async function setStageDateCell(args: { tab: string; cell: string; value: string }) {
  const allowed: Record<string, string[]> = {
    [BILLING_SHEET_TAB]: ["M", "N"],
    [OFFER_SHEET_TAB]: ["J", "K"],
  };
  const m = args.cell.match(/^([A-Z]+)(\d+)$/);
  if (!m || !allowed[args.tab]?.includes(m[1])) throw new Error(`${args.tab} ${args.cell} は直せません`);
  const spreadsheetId = resolveCompanyMasterSpreadsheetId();
  if (!spreadsheetId) throw new Error("企業データベースのスプシIDが未設定");
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${quote(args.tab)}!${args.cell}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[args.value]] },
  });
}

type SheetsClient = Awaited<ReturnType<typeof getSheetsClient>>;

const MONTH_HEADER_RE = /^(\d{1,2})月$/;

async function tabSheetId(sheets: SheetsClient, spreadsheetId: string, tab: string): Promise<number> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties(sheetId,title)" });
  const hit = meta.data.sheets?.find((s) => s.properties?.title === tab);
  if (hit?.properties?.sheetId == null) throw new Error(`タブ「${tab}」が見つからない`);
  return hit.properties.sheetId;
}

/** 「YYYY/MM/DD」などの先頭から [年, 月] */
function yearMonthOf(v: string | undefined): [number, number] | null {
  const m = (v ?? "").trim().match(/^(\d{4})[/-](\d{1,2})/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/** 内定者管理のどこに行を差し込むか (シートは触らない。テストしやすいように分けている) */
export function planOfferInsert(rows: string[][], headerRow: number, dateCol: number, date: string) {
  const [ty, tm] = date.split("-").map(Number);
  const a = (i: number) => (rows[i]?.[0] ?? "").trim();
  const hasData = (i: number) => {
    const v = a(i);
    return !!v && !MONTH_HEADER_RE.test(v);
  };

  let lastData = headerRow;
  for (let i = headerRow + 1; i < rows.length; i++) if (a(i)) lastData = i;

  // 月の区切り行と、その区切りの年 (区切りの下の行の内定日から。分からなければ 1 つ前の区切りから繰り上げ)
  type Section = { row: number; year: number | null; month: number; end: number };
  const sections: Section[] = [];
  for (let i = headerRow + 1; i <= lastData; i++) {
    const m = a(i).match(MONTH_HEADER_RE);
    if (m) sections.push({ row: i, year: null, month: Number(m[1]), end: i });
  }
  for (let k = 0; k < sections.length; k++) {
    const sec = sections[k];
    const next = k + 1 < sections.length ? sections[k + 1].row : lastData + 1;
    sec.end = sec.row;
    for (let i = sec.row + 1; i < next; i++) {
      if (!hasData(i)) continue;
      sec.end = i;
      const ym = yearMonthOf(rows[i]?.[dateCol]);
      if (sec.year == null && ym && ym[1] === sec.month) sec.year = ym[0];
    }
  }
  for (let k = 0; k < sections.length; k++) {
    if (sections[k].year != null) continue;
    const prev = sections[k - 1];
    sections[k].year = prev?.year != null ? (sections[k].month < prev.month ? prev.year + 1 : prev.year) : ty;
  }
  const key = (y: number, m: number) => y * 12 + m;

  // 同じ月の区切り (下にあるほうを優先)
  const same = [...sections].reverse().find((s) => s.year === ty && s.month === tm);
  // 区切りが無いときに入れる位置 = 月の順で次に来る区切りの前 / 無ければ一番下
  const later = sections.find((s) => key(s.year ?? ty, s.month) > key(ty, tm));
  const insertAt = same ? same.end + 1 : later ? later.row : lastData + 1;
  // 一番上の区切りより前の月 (区切りを作る前の古い内定) は、区切りを作らずにその直前に入れる
  const withHeader = !same && sections.length > 0 && later !== sections[0];
  const count = withHeader ? 2 : 1;

  const headerSource = sections.length > 0 ? sections[sections.length - 1].row : -1;
  return { insertAt, withHeader, count, lastData, headerSource };
}

/**
 * 内定者管理に候補者の行を差し込み、その行の index (0 始まり) を返す。
 * - 内定日の月の「N月」区切りがあれば、その区切りの最後のデータ行の次に入れる
 * - 無ければ、月の順で次に来る区切りの前に「N月」の区切り行と一緒に入れる (後ろの月が無ければ一番下)
 */
async function insertOfferRow(args: {
  sheets: SheetsClient;
  spreadsheetId: string;
  tab: string;
  rows: string[][];
  headerRow: number;
  dateCol: number;
  date: string;
  id: string;
}): Promise<number> {
  const { sheets, spreadsheetId, tab, date, id } = args;
  const [, tm] = date.split("-").map(Number);
  const { insertAt, withHeader, count, lastData, headerSource } = planOfferInsert(args.rows, args.headerRow, args.dateCol, date);
  const sheetId = await tabSheetId(sheets, spreadsheetId, tab);
  // 写し元: データの下の空き行 (B〜F の関数と M の「未」が入っている)。差し込みで下にずれる分を足す
  const template = lastData + 1 + (lastData + 1 >= insertAt ? count : 0);
  const headerSrc = headerSource >= 0 ? headerSource + (headerSource >= insertAt ? count : 0) : -1;
  const grid = (r: number) => ({ sheetId, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 0, endColumnIndex: 60 });

  const requests: object[] = [
    { insertDimension: { range: { sheetId, dimension: "ROWS", startIndex: insertAt, endIndex: insertAt + count }, inheritFromBefore: insertAt > 0 } },
  ];
  const dataRow = insertAt + (withHeader ? 1 : 0);
  requests.push({ copyPaste: { source: grid(template), destination: grid(dataRow), pasteType: "PASTE_NORMAL" } });
  if (withHeader && headerSrc >= 0) {
    requests.push({ copyPaste: { source: grid(headerSrc), destination: grid(insertAt), pasteType: "PASTE_FORMAT" } });
  }
  await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });

  const values = withHeader ? [[`${tm}月`], [id]] : [[id]];
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${quote(tab)}!A${insertAt + 1}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });
  return dataRow;
}

/**
 * カンバンから外した・内定より前に戻したときに、システムが足した内定者管理の行を消す。
 * 内定日・内定承諾日のほかに何か手で入れてあれば (申請種別・申請日など) 残す。
 * 消したあと月の区切りの中が空になったら、その区切り行も消す。
 */
export async function removeUntouchedOfferRow(personId: number): Promise<{ removed: boolean; reason?: string }> {
  const spreadsheetId = resolveCompanyMasterSpreadsheetId();
  if (!spreadsheetId) return { removed: false, reason: "企業データベースのスプシIDが未設定" };
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${quote(OFFER_SHEET_TAB)}!A1:AZ2000` });
  const rows = (res.data.values ?? []).map((r) => r.map((c) => String(c ?? "")));
  let headerRow = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) if (rows[i].some((c) => c.trim() === "内定日")) { headerRow = i; break; }
  if (headerRow < 0) return { removed: false, reason: "見出しが無い" };
  const head = rows[headerRow].map((c) => c.trim());
  const keep = new Set(["内定日", "内定承諾日", "ファイル回収"].map((h) => head.indexOf(h)).filter((i) => i >= 0));
  const id = sheetPersonId(personId);
  const idNum = String(personId);
  const row = rows.findIndex((r, i) => i > headerRow && ((r[0] ?? "").trim() === id || (r[0] ?? "").trim() === idNum));
  if (row < 0) return { removed: false, reason: "行が無い" };
  // 手入力の列 (G 列以降。関数の B〜F と、内定日・内定承諾日・ファイル回収の「未」は見ない)
  const touched = rows[row].some((v, j) => {
    if (j < 6 || keep.has(j)) return false;
    return v.trim() !== "";
  });
  const fileCol = head.indexOf("ファイル回収");
  if (touched || (fileCol >= 0 && !["", "未"].includes((rows[row][fileCol] ?? "").trim()))) {
    return { removed: false, reason: "手で入れた内容があるので残す" };
  }
  const a = (i: number) => (rows[i]?.[0] ?? "").trim();
  // 月の区切りの中がこの行だけなら、区切りも一緒に消す
  const above = row - 1;
  const belowIsBoundary = !a(row + 1) || MONTH_HEADER_RE.test(a(row + 1));
  const start = MONTH_HEADER_RE.test(a(above)) && belowIsBoundary ? above : row;
  const sheetId = await tabSheetId(sheets, spreadsheetId, OFFER_SHEET_TAB);
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: start, endIndex: row + 1 } } }] },
  });
  return { removed: true };
}
