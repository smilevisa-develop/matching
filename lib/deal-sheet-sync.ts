/**
 * 企業データベース (Google スプレッドシート) への 系 → スプシ 一方向 差分同期。
 *
 * 対象タブ:
 *   「案件管理」   … SMILE MATCHING の案件 (Deal) を反映する
 *   「企業マスタ」 … 系にあってマスタに無い企業を 追記 する
 *
 * ── 実物のシート構造に合わせた重要な制約 ──
 *
 * 1. 案件管理の C/D/E 列は数式で、書き込んではいけない
 *      C 企業ID  = XLOOKUP(企業名, 企業マスタ)          ← B を書けば自動で埋まる
 *      D 案件 ID = 企業ID_受注日_職種コード             ← C/F/G から自動生成
 *      E 案件名  = 受注日_職種コード_企業名             ← F/G/B から自動生成
 *    これらに値を書くと数式が壊れるので、系からは B/F/G など「元の値」だけを書く。
 *
 * 2. C/D/E の数式は 1002 行目まで引かれている
 *    そのため values.append は「最後の値がある行」を 1002 と判断し、
 *    はるか下に行を足してしまう。追記は 企業名(B) が空の最初の行を自分で探して
 *    values.update で書き込む。
 *
 * 3. 企業マスタの見出しは A1 が「列 1」で、「企業ID」ではない
 *    見出しの検出は「企業名」を基準にし、企業ID列はその 1 つ左とみなす。
 *
 * ── 同期の方針 (候補者同期と同じ) ──
 *   変更があった値だけ書く / 系が空の項目は既存値を残す / 新規は追記
 *
 * ── なぜ単純に番号で上書きしないか ──
 * 当初はスプシの「案件ID(001,002…)」と系の Deal.id が一致していたが、
 * その後どちらにも独立して案件が足され、番号がずれた。
 * 例: 系の案件11 = 株式会社イワタ(55sv) / スプシの011 = 有限会社山王(50sv)
 * そこで「案件IDが一致し、かつ企業IDも一致する行」だけを更新し、
 * 食い違う行は触らずに 空いている番号で新規追記する。
 */

import type { sheets_v4 } from "googleapis";
import { getSheetsClient } from "@/lib/sheets-sync";

export const DEAL_SHEET_TAB = "案件管理";
export const COMPANY_MASTER_TAB = "企業マスタ";

/** 案件管理の列 (0 始まり) */
export const DEAL_COL = {
  dealNo: 0, // A 案件ID (001…)
  companyName: 1, // B 企業名   ← C/D/E の数式の入力になる
  companyId: 2, // C 企業ID   【数式・書込禁止】
  dealKey: 3, // D 案件 ID  【数式・書込禁止】
  dealName: 4, // E 案件名   【数式・書込禁止】
  acceptedAt: 5, // F 受注日
  job: 6, // G 職種
  status: 7, // H ステータス
  owner: 8, // I 担当者
  required: 10, // K 募集人数
  recommended: 11, // L 推薦人数
  interview: 12, // M 面接人数
  offer: 13, // N 内定人数
  contract: 14, // O 成約人数
  inflow: 15, // P 流入
  acquirer: 16, // Q 案件獲得者
  unitPrice: 17, // R 単価
} as const;

/** 数式が入っているため絶対に書き込まない列 */
const FORMULA_COLS: number[] = [DEAL_COL.companyId, DEAL_COL.dealKey, DEAL_COL.dealName];

/**
 * 既存行で更新してよい列 = 系が正しく持っている「進捗」だけ。
 *
 * 実データで試したところ、次の 3 つは上書きすると スプシを劣化させるため外した:
 *   職種 (G)     … スプシは職種コード表の表記 (外食 / 機械加工)、系は分野名で体系が違う
 *   単価 (R)     … 系の値が実態と食い違う例が複数あり、請求シートが参照する列
 *   成約人数 (O) … 系では UI 上廃止済みで常に 0
 */
const UPDATABLE_COLS = [
  DEAL_COL.status,
  DEAL_COL.owner,
  DEAL_COL.required,
  DEAL_COL.recommended,
  DEAL_COL.interview,
  DEAL_COL.offer,
] as const;

/** 新規行で書き込む列 (数式列は含めない) */
const NEW_ROW_COLS: number[] = [
  DEAL_COL.dealNo,
  DEAL_COL.companyName,
  DEAL_COL.acceptedAt,
  DEAL_COL.job,
  DEAL_COL.status,
  DEAL_COL.owner,
  DEAL_COL.required,
  DEAL_COL.recommended,
  DEAL_COL.interview,
  DEAL_COL.offer,
  DEAL_COL.inflow,
  DEAL_COL.unitPrice,
];

/** 人数の列 (空欄に 0 を書き込まない判定に使う) */
const COUNT_COLS: number[] = [
  DEAL_COL.required,
  DEAL_COL.recommended,
  DEAL_COL.interview,
  DEAL_COL.offer,
  DEAL_COL.contract,
];

/** 同期対象の案件 */
export type DealForSheet = {
  id: number;
  /** スプシ「案件管理」の 案件ID。一度対応づいたらこれを使う (null なら id を候補にする) */
  sheetDealNo: string | null;
  title: string;
  field: string | null;
  status: string;
  unitPrice: string | null;
  acceptedAt: Date | null;
  createdAt: Date;
  requiredCount: number;
  recommendedCount: number;
  interviewCount: number;
  offerCount: number;
  contractCount: number;
  companyExternalId: string | null;
  companyName: string;
  ownerName: string | null;
  partnerName: string | null;
};

/** 企業マスタへの追記対象 */
export type CompanyForMaster = {
  externalId: string | null;
  name: string;
  industry: string | null;
};

/** 案件ID を 3 桁に揃える (12 → "012") */
export function formatDealNo(id: number): string {
  return String(id).padStart(3, "0");
}

/** "¥300,000" / "150.000円" / "280000" → 数値。読めなければ null */
export function parseMoney(value: string | null | undefined): number | null {
  const s = (value ?? "").trim();
  if (!s) return null;
  const digits = s.replace(/[，,]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(/[^0-9]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Date → "YYYY/MM/DD" */
export function toSheetDate(d: Date | null): string {
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}/${m}/${day}`;
}

/** A1 表記用にシート名をエスケープ */
function quote(name: string): string {
  return `'${name.replace(/'/g, "''")}'`;
}

/** 0 始まりの列 index → A1 の列文字 (0→A, 25→Z, 26→AA) */
export function colLetter(index: number): string {
  let n = index;
  let s = "";
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

type SheetTable = {
  /** ヘッダ行の 1 始まり行番号 */
  headerRow: number;
  /** 全行 (0 始まり配列) */
  rows: string[][];
};

/** タブを読み、指定ヘッダ語を含む行をヘッダとして検出する */
async function readTable(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  tab: string,
  headerKeyword: string,
): Promise<SheetTable> {
  let res;
  try {
    res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${quote(tab)}!A1:AZ2000`,
    });
  } catch (e) {
    // タブ名が違うときにすぐ気づけるよう、実在するタブ名を添えて投げ直す
    const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties.title" });
    const names = (meta.data.sheets ?? []).map((s) => s.properties?.title).filter(Boolean);
    throw new Error(
      `「${tab}」タブを読めません (実在するタブ: ${names.join(" / ")})。元エラー: ${
        e instanceof Error ? e.message : "error"
      }`,
    );
  }
  const rows = (res.data.values ?? []).map((r) => r.map((c) => String(c ?? "")));
  let headerRow = -1;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    if (rows[i].some((c) => c.trim() === headerKeyword)) {
      headerRow = i + 1; // 1 始まり
      break;
    }
  }
  if (headerRow < 0) {
    throw new Error(`「${tab}」タブに見出し (${headerKeyword}) が見つかりません`);
  }
  return { headerRow, rows };
}

/**
 * 追記してよい最初の行を探す。
 * C/D/E に数式が下まで引かれているため、行の有無は「目印の列」だけで判断する。
 */
function firstEmptyRow(rows: string[][], headerRow: number, markerCol: number): number {
  let last = headerRow; // 1 始まり
  for (let i = headerRow; i < rows.length; i++) {
    if (String(rows[i]?.[markerCol] ?? "").trim()) last = i + 1;
  }
  return last + 1;
}

export type DealSyncResult = {
  apply: boolean;
  sheetRowCount: number;
  updated: { dealNo: string; row: number; company: string; changes: string[] }[];
  appended: { dealNo: string; row: number; company: string; title: string }[];
  /** 案件ID は在るが企業IDが食い違うため触らなかった行 */
  conflicts: { dealNo: string; row: number; sheetCompany: string; systemCompany: string }[];
  skipped: { dealId: number; company: string; reason: string }[];
  unchanged: number;
  /** 系に記録する 案件ID の割り当て (Deal.sheetDealNo に保存する) */
  assignments: { dealId: number; sheetDealNo: string }[];
};

export type DealSyncPlan = {
  result: DealSyncResult;
  updates: { range: string; values: (string | number)[][] }[];
};

/**
 * どの行をどう書き換えるかを決める純粋関数 (Sheets API を触らない)。
 * 本番のスプシに書く前に実データで挙動を検証できるよう分離している。
 */
export function planDealSync(args: {
  headerRow: number;
  rows: string[][];
  deals: DealForSheet[];
  tab: string;
  apply: boolean;
}): DealSyncPlan {
  const { headerRow, rows, deals, tab, apply } = args;

  // スプシ側: 案件ID → 行番号(1始まり) と 行データ
  const byDealNo = new Map<string, { row: number; cells: string[] }>();
  const usedDealNos = new Set<string>();
  for (let i = headerRow; i < rows.length; i++) {
    const cells = rows[i] ?? [];
    const no = String(cells[DEAL_COL.dealNo] ?? "").trim();
    if (!no || !Number.isFinite(Number(no))) continue;
    const key = String(Number(no));
    usedDealNos.add(key);
    if (!byDealNo.has(key)) byDealNo.set(key, { row: i + 1, cells });
  }

  const result: DealSyncResult = {
    apply,
    sheetRowCount: byDealNo.size,
    updated: [],
    appended: [],
    conflicts: [],
    skipped: [],
    unchanged: 0,
    assignments: [],
  };
  const updates: { range: string; values: (string | number)[][] }[] = [];

  // 企業名(B)を目印に、書き込んでよい最初の空行を求める
  let writeRow = firstEmptyRow(rows, headerRow, DEAL_COL.companyName);

  const valueFor = (d: DealForSheet, col: number): string | number | null => {
    switch (col) {
      case DEAL_COL.dealNo:
        return null; // 追記時に個別指定する
      case DEAL_COL.companyName:
        return d.companyName;
      case DEAL_COL.acceptedAt:
        return toSheetDate(d.acceptedAt ?? d.createdAt);
      case DEAL_COL.job:
        return d.field ?? "";
      case DEAL_COL.status:
        return d.status ?? "";
      case DEAL_COL.owner:
        return d.ownerName ?? "";
      case DEAL_COL.required:
        return d.requiredCount;
      case DEAL_COL.recommended:
        return d.recommendedCount;
      case DEAL_COL.interview:
        return d.interviewCount;
      case DEAL_COL.offer:
        return d.offerCount;
      case DEAL_COL.contract:
        return d.contractCount;
      case DEAL_COL.inflow:
        return d.partnerName ? "パートナー" : "直";
      case DEAL_COL.unitPrice:
        return parseMoney(d.unitPrice);
      default:
        return null;
    }
  };

  /** 空いている 案件ID を採番する */
  const nextFreeNo = (): number => {
    let n = 1;
    while (usedDealNos.has(String(n))) n++;
    return n;
  };

  /** 案件を新しい行として書き込む (数式列 C/D/E には触れない) */
  const appendDeal = (d: DealForSheet, dealNo: string) => {
    const row = writeRow;
    for (const col of NEW_ROW_COLS) {
      if (FORMULA_COLS.includes(col)) continue; // 保険: 数式列は絶対に書かない
      const v = col === DEAL_COL.dealNo ? dealNo : valueFor(d, col);
      if (v === null || v === "") continue;
      updates.push({ range: `${quote(tab)}!${colLetter(col)}${row}`, values: [[v]] });
    }
    writeRow++;
    usedDealNos.add(String(Number(dealNo)));
    result.appended.push({ dealNo, row, company: d.companyName, title: d.title });
    result.assignments.push({ dealId: d.id, sheetDealNo: dealNo });
  };

  for (const d of deals) {
    // 一度対応づいた番号があればそれを使う。無ければ Deal.id を候補にする
    const key = d.sheetDealNo ? String(Number(d.sheetDealNo)) : String(d.id);
    const hit = byDealNo.get(key);

    if (hit) {
      const sheetCid = String(hit.cells[DEAL_COL.companyId] ?? "").trim().toLowerCase();
      const sysCid = (d.companyExternalId ?? "").trim().toLowerCase();
      if (!sysCid || sheetCid !== sysCid) {
        // 別会社の行なので書き換えない。空き番号で新しい行として追記する
        result.conflicts.push({
          dealNo: formatDealNo(Number(key)),
          row: hit.row,
          sheetCompany: `${sheetCid || "(空)"} ${hit.cells[DEAL_COL.companyName] ?? ""}`.trim(),
          systemCompany: `${sysCid || "(空)"} ${d.companyName}`.trim(),
        });
        if (!sysCid) {
          result.skipped.push({
            dealId: d.id,
            company: d.companyName,
            reason: "企業IDが未設定のため、別番号での追記もできません",
          });
          continue;
        }
        appendDeal(d, formatDealNo(nextFreeNo()));
        continue;
      }

      const changes: string[] = [];
      for (const col of UPDATABLE_COLS) {
        const next = valueFor(d, col);
        if (next === null || next === "") continue;
        const cur = String(hit.cells[col] ?? "").trim();
        // 空欄の人数列に 0 を書き込まない (意味のない変更で差分が埋まるのを防ぐ)
        if (!cur && next === 0 && COUNT_COLS.includes(col)) continue;
        const nextStr = typeof next === "number" ? String(next) : next.trim();
        if (cur === nextStr) continue;
        changes.push(`${colLetter(col)}: ${cur || "(空)"} → ${nextStr}`);
        updates.push({ range: `${quote(tab)}!${colLetter(col)}${hit.row}`, values: [[next]] });
      }
      if (d.sheetDealNo !== formatDealNo(Number(key))) {
        result.assignments.push({ dealId: d.id, sheetDealNo: formatDealNo(Number(key)) });
      }
      if (changes.length === 0) result.unchanged++;
      else
        result.updated.push({
          dealNo: formatDealNo(Number(key)),
          row: hit.row,
          company: d.companyName,
          changes,
        });
      continue;
    }

    if (!d.companyExternalId) {
      result.skipped.push({
        dealId: d.id,
        company: d.companyName,
        reason: "企業IDが未設定のため追記できません (企業マスタで企業IDを付けてください)",
      });
      continue;
    }
    appendDeal(d, formatDealNo(usedDealNos.has(key) ? nextFreeNo() : Number(key)));
  }

  return { result, updates };
}

/** 案件を「案件管理」タブへ差分同期する */
export async function syncDealsToSheet(args: {
  spreadsheetId: string;
  deals: DealForSheet[];
  apply: boolean;
  tab?: string;
}): Promise<DealSyncResult> {
  const { spreadsheetId, deals, apply } = args;
  const tab = args.tab ?? DEAL_SHEET_TAB;
  const sheets = await getSheetsClient();
  const { headerRow, rows } = await readTable(sheets, spreadsheetId, tab, "案件ID");

  const { result, updates } = planDealSync({ headerRow, rows, deals, tab, apply });

  if (apply && updates.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: { valueInputOption: "USER_ENTERED", data: updates },
    });
  }
  return result;
}

export type MasterSyncResult = {
  apply: boolean;
  masterRowCount: number;
  appended: { externalId: string; name: string; industry: string; row: number }[];
  skipped: { name: string; reason: string }[];
};

/**
 * 系にあって企業マスタに無い企業を、マスタの末尾に 追記 する。
 * 企業マスタは「マスタが正」の運用なので、既存行は一切書き換えない。
 */
export async function appendCompaniesToMaster(args: {
  spreadsheetId: string;
  companies: CompanyForMaster[];
  apply: boolean;
  tab?: string;
}): Promise<MasterSyncResult> {
  const { spreadsheetId, companies, apply } = args;
  const tab = args.tab ?? COMPANY_MASTER_TAB;
  const sheets = await getSheetsClient();
  // A1 の見出しは「列 1」で「企業ID」ではないため、企業名を基準に見出し行を探す
  const { headerRow, rows } = await readTable(sheets, spreadsheetId, tab, "企業名");

  const header = rows[headerRow - 1].map((c) => c.trim());
  const nameCol = header.findIndex((c) => c === "企業名");
  const indCol = header.findIndex((c) => c === "分野");
  // 企業ID列は見出しが「企業ID」でないことがあるので、企業名の 1 つ左を採用する
  const idCol = Math.max(0, nameCol - 1);

  const existing = new Set<string>();
  for (let i = headerRow; i < rows.length; i++) {
    const id = String(rows[i]?.[idCol] ?? "").trim().toLowerCase();
    if (id) existing.add(id);
  }

  const result: MasterSyncResult = {
    apply,
    masterRowCount: existing.size,
    appended: [],
    skipped: [],
  };

  let writeRow = firstEmptyRow(rows, headerRow, nameCol);
  const updates: { range: string; values: (string | number)[][] }[] = [];

  for (const co of companies) {
    const id = (co.externalId ?? "").trim().toLowerCase();
    if (!id) {
      result.skipped.push({ name: co.name, reason: "企業IDが未設定" });
      continue;
    }
    // 企業IDの体裁 (英数字) から外れるものは手入力ミスの可能性が高いので追記しない
    if (!/^[a-z0-9]{2,}$/.test(id)) {
      result.skipped.push({ name: co.name, reason: `企業IDの形式が不正です (${co.externalId})` });
      continue;
    }
    if (existing.has(id)) continue;

    updates.push({ range: `${quote(tab)}!${colLetter(idCol)}${writeRow}`, values: [[id]] });
    updates.push({ range: `${quote(tab)}!${colLetter(nameCol)}${writeRow}`, values: [[co.name]] });
    if (indCol >= 0 && co.industry) {
      updates.push({ range: `${quote(tab)}!${colLetter(indCol)}${writeRow}`, values: [[co.industry]] });
    }
    existing.add(id);
    result.appended.push({
      externalId: id,
      name: co.name,
      industry: co.industry ?? "",
      row: writeRow,
    });
    writeRow++;
  }

  if (apply && updates.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: { valueInputOption: "USER_ENTERED", data: updates },
    });
  }
  return result;
}
