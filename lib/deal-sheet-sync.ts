/**
 * 企業データベース (Google スプレッドシート) への 系 → スプシ 一方向 差分同期。
 *
 * 対象タブ:
 *   「案件情報」 … SMILE MATCHING の案件 (Deal) を反映する
 *   「企業マスタ」 … 系にあってマスタに無い企業を 追記 する
 *
 * ── なぜ単純な上書きにしないか ──
 * 当初はスプシの「案件ID(001,002…)」と系の Deal.id が一致していたが、
 * その後どちらにも独立して案件が足され、番号がずれた。
 * 例: 系の案件11 = 株式会社イワタ(55sv) / スプシの011 = 有限会社山王(50sv)
 * 番号だけで書き込むと 別会社の行を壊す ため、
 *   「案件ID が一致し、かつ 企業ID も一致する行」だけを更新対象にする。
 * 一致しない行は触らず、報告 (conflicts) に出して人が直せるようにする。
 *
 * ── 更新する列 / 触らない列 ──
 * 既存行は運用値だけを更新する。
 *   更新する: G 職種 / H ステータス / I 担当者 / K〜O 各人数 / R 単価
 *   触らない: A 案件ID / B 企業名 / C 企業ID / D 案件 ID / E 案件名 / F 受注日 /
 *             P 流入 / Q 案件獲得者 / T〜W 請求系 / その他の空列
 * 案件名・案件 ID・受注日 はスプシ独自の命名規則で、他シートが参照している可能性が
 * あるため既存行では書き換えない。新規追記時のみ規則に沿って生成する。
 *
 * 空欄は上書きしない (系が空の項目は既存のスプシ値を残す)。候補者同期と同じ方針。
 */

import type { sheets_v4 } from "googleapis";
import { getSheetsClient } from "@/lib/sheets-sync";

export const DEAL_SHEET_TAB = "案件情報";
export const COMPANY_MASTER_TAB = "企業マスタ";

/** 案件情報の列 (0 始まり) */
export const DEAL_COL = {
  dealNo: 0, // A 案件ID (001…)
  companyName: 1, // B 企業名
  companyId: 2, // C 企業ID
  dealKey: 3, // D 案件 ID (企業ID_受注日_職種コード)
  dealName: 4, // E 案件名
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

/**
 * 既存行で更新してよい列 = 系が正しく持っている「進捗」だけ。
 *
 * 実データで試したところ、次の 3 つは上書きすると スプシを劣化させる ため外した:
 *   - 職種 (G)   … スプシは職種コード表の表記 (外食 / 機械加工)、
 *                  系は分野名 (外食業 / 工業製品製造業) で体系が違う
 *   - 単価 (R)   … 系の値が実態と食い違う例が複数あり (¥300,000 → 150000 など)、
 *                  かつスプシの単価は請求シートが参照する
 *   - 成約人数 (O) … 系では UI 上廃止された項目で、常に 0 が入っている
 */
const UPDATABLE_COLS = [
  DEAL_COL.status,
  DEAL_COL.owner,
  DEAL_COL.required,
  DEAL_COL.recommended,
  DEAL_COL.interview,
  DEAL_COL.offer,
] as const;

/** 人数の列 (空欄に 0 を書き込まない判定に使う) */
const COUNT_COLS: number[] = [
  DEAL_COL.required,
  DEAL_COL.recommended,
  DEAL_COL.interview,
  DEAL_COL.offer,
  DEAL_COL.contract,
];

/** 案件情報の総列数 (A〜W) */
const DEAL_COL_COUNT = 23;

/**
 * 職種 → コード (スプシ「職種コード」表に準拠)。
 * 系の分野名は「外食業」「工業製品製造業」のように末尾が揺れるため、
 * 前方一致で引けるように短い順に並べている。
 */
const JOB_CODES: [string, string][] = [
  ["リネンサプライ", "linen"],
  ["ビルクリーニング", "clean"],
  ["飲食料品製造", "fdmfg"],
  ["工業製品製造", "indus"],
  ["自動車整備", "auto"],
  ["機械加工", "mach"],
  ["ドライブ", "driver"],
  ["自動車運送", "driver"],
  ["宿泊", "hotel"],
  ["外食", "food"],
  ["介護", "care"],
  ["建設", "const"],
  ["農業", "agri"],
];

/** 分野名から職種コードを引く (見つからなければ null) */
export function jobCode(field: string | null | undefined): string | null {
  const f = (field ?? "").trim();
  if (!f) return null;
  for (const [name, code] of JOB_CODES) {
    if (f.startsWith(name) || f.includes(name)) return code;
  }
  return null;
}

/** 同期対象の案件 */
export type DealForSheet = {
  id: number;
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

/** 系にあってマスタに無いか判定するための企業 */
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
  // 桁区切りに使われている , と . を除去してから数字を拾う
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
  /** 全行 (ヘッダ含む、0 始まり配列) */
  rows: string[][];
};

/** タブを読み、指定ヘッダ語を含む行をヘッダとして検出する */
async function readTable(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  tab: string,
  headerKeyword: string,
): Promise<SheetTable> {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${quote(tab)}!A1:AZ2000`,
  });
  const rows = (res.data.values ?? []).map((r) => r.map((c) => String(c ?? "")));
  let headerRow = -1;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    if (rows[i].some((c) => c.trim() === headerKeyword)) {
      headerRow = i + 1; // 1 始まり
      break;
    }
  }
  if (headerRow < 0) {
    throw new Error(`「${tab}」タブに ヘッダ (${headerKeyword}) が見つかりません`);
  }
  return { headerRow, rows };
}

export type DealSyncResult = {
  apply: boolean;
  sheetRowCount: number;
  /** 更新した (する) 案件 */
  updated: { dealNo: string; row: number; company: string; changes: string[] }[];
  /** 追記した (する) 案件 */
  appended: { dealNo: string; company: string; title: string }[];
  /** 案件ID は在るが企業IDが食い違うため触らなかった行 */
  conflicts: { dealNo: string; row: number; sheetCompany: string; systemCompany: string }[];
  /** 案件ID が既にスプシで使われていて追記できなかった案件 */
  skipped: { dealId: number; company: string; reason: string }[];
  /** 変更が無かった件数 */
  unchanged: number;
};

/**
 * 案件 (Deal) を「案件情報」タブへ差分同期する。
 * @param apply false ならドライラン (書き込まない)
 */
/** 差分計算の結果 (書き込み前の計画) */
export type DealSyncPlan = {
  result: DealSyncResult;
  updates: { range: string; values: (string | number)[][] }[];
  appendRows: (string | number)[][];
};

/**
 * どの行をどう書き換えるかを決める純粋関数 (Sheets API を触らない)。
 * ここを分けているのは、本番のスプシに書く前に実データで挙動を検証できるようにするため。
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
  };

  /** 既存行に書き込む値 (空文字/null は「変更しない」) */
  const valueFor = (d: DealForSheet, col: number): string | number | null => {
    switch (col) {
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
      case DEAL_COL.unitPrice:
        return parseMoney(d.unitPrice);
      default:
        return null;
    }
  };

  const updates: { range: string; values: (string | number)[][] }[] = [];
  const appendRows: (string | number)[][] = [];

  for (const d of deals) {
    const key = String(d.id);
    const hit = byDealNo.get(key);

    if (hit) {
      // 企業IDが食い違う行は 別会社の行 なので絶対に触らない
      const sheetCid = String(hit.cells[DEAL_COL.companyId] ?? "").trim().toLowerCase();
      const sysCid = (d.companyExternalId ?? "").trim().toLowerCase();
      if (!sysCid || sheetCid !== sysCid) {
        result.conflicts.push({
          dealNo: formatDealNo(d.id),
          row: hit.row,
          sheetCompany: `${sheetCid || "(空)"} ${hit.cells[DEAL_COL.companyName] ?? ""}`.trim(),
          systemCompany: `${sysCid || "(空)"} ${d.companyName}`.trim(),
        });
        continue;
      }

      // 値が変わる列だけ書き込む (系が空の列は既存値を残す)
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
      if (changes.length === 0) result.unchanged++;
      else
        result.updated.push({
          dealNo: formatDealNo(d.id),
          row: hit.row,
          company: d.companyName,
          changes,
        });
      continue;
    }

    // スプシに無い案件 → 末尾に追記する
    if (usedDealNos.has(key)) {
      result.skipped.push({
        dealId: d.id,
        company: d.companyName,
        reason: `案件ID ${formatDealNo(d.id)} は既にスプシの別の行で使われています`,
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

    const cid = d.companyExternalId.trim().toLowerCase();
    const date = d.acceptedAt ?? d.createdAt;
    const ymd = toSheetDate(date).replace(/\//g, "");
    const code = jobCode(d.field);
    // スプシの命名規則: 案件 ID = 企業ID_受注日_職種コード / 案件名 = 受注日_職種コード_企業名
    const dealKey = code ? `${cid}_${ymd}_${code}` : `${cid}_${ymd}`;
    const dealName = code ? `${ymd}_${code}_${d.companyName}` : `${ymd}_${d.companyName}`;

    const row: (string | number)[] = new Array(DEAL_COL_COUNT).fill("");
    row[DEAL_COL.dealNo] = formatDealNo(d.id);
    row[DEAL_COL.companyName] = d.companyName;
    row[DEAL_COL.companyId] = cid;
    row[DEAL_COL.dealKey] = dealKey;
    row[DEAL_COL.dealName] = dealName;
    row[DEAL_COL.acceptedAt] = toSheetDate(date);
    row[DEAL_COL.job] = d.field ?? "";
    row[DEAL_COL.status] = d.status ?? "";
    row[DEAL_COL.owner] = d.ownerName ?? "";
    row[DEAL_COL.required] = d.requiredCount;
    row[DEAL_COL.recommended] = d.recommendedCount;
    row[DEAL_COL.interview] = d.interviewCount;
    row[DEAL_COL.offer] = d.offerCount;
    row[DEAL_COL.contract] = d.contractCount;
    row[DEAL_COL.inflow] = d.partnerName ? "パートナー" : "直";
    const price = parseMoney(d.unitPrice);
    if (price !== null) row[DEAL_COL.unitPrice] = price;

    appendRows.push(row);
    usedDealNos.add(key);
    result.appended.push({ dealNo: formatDealNo(d.id), company: d.companyName, title: d.title });
  }

  return { result, updates, appendRows };
}

/**
 * 案件 (Deal) を「案件情報」タブへ差分同期する。
 * @param apply false ならドライラン (書き込まない)
 */
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

  const { result, updates, appendRows } = planDealSync({ headerRow, rows, deals, tab, apply });

  if (apply) {
    if (updates.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: { valueInputOption: "USER_ENTERED", data: updates },
      });
    }
    if (appendRows.length > 0) {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${quote(tab)}!A${headerRow + 1}`,
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: appendRows },
      });
    }
  }

  return result;
}

export type MasterSyncResult = {
  apply: boolean;
  masterRowCount: number;
  appended: { externalId: string; name: string; industry: string }[];
  skipped: { name: string; reason: string }[];
};

/**
 * 系にあって企業マスタに無い企業を、マスタの末尾に 追記 する。
 *
 * 企業マスタは「マスタが正」の運用なので、既存行は一切書き換えない。
 * 系で新しく作られた企業を取りこぼさないための片方向の追記だけを行う。
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
  const { headerRow, rows } = await readTable(sheets, spreadsheetId, tab, "企業ID");

  // ヘッダから列位置を取る (企業マスタは列構成が変わりうるため)
  const header = rows[headerRow - 1].map((c) => c.trim());
  const idCol = header.findIndex((c) => c === "企業ID");
  const nameCol = header.findIndex((c) => c === "企業名");
  const indCol = header.findIndex((c) => c === "分野");
  const width = Math.max(header.length, idCol + 1, nameCol + 1, indCol + 1);

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
  const appendRows: string[][] = [];

  for (const co of companies) {
    const id = (co.externalId ?? "").trim().toLowerCase();
    if (!id) {
      result.skipped.push({ name: co.name, reason: "企業IDが未設定" });
      continue;
    }
    // 企業IDの体裁 (英数字) から外れるものは、手入力ミスの可能性が高いので追記しない
    if (!/^[a-z0-9]{2,}$/.test(id)) {
      result.skipped.push({ name: co.name, reason: `企業IDの形式が不正です (${co.externalId})` });
      continue;
    }
    if (existing.has(id)) continue;

    const row = new Array(width).fill("");
    if (idCol >= 0) row[idCol] = id;
    if (nameCol >= 0) row[nameCol] = co.name;
    if (indCol >= 0) row[indCol] = co.industry ?? "";
    appendRows.push(row);
    existing.add(id);
    result.appended.push({ externalId: id, name: co.name, industry: co.industry ?? "" });
  }

  if (apply && appendRows.length > 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${quote(tab)}!A${headerRow + 1}`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: appendRows },
    });
  }

  return result;
}
