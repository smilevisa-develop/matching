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

/**
 * スプシ「設定」タブの職種表 (職種 → コード)。
 * 案件管理の D/E 列の数式はこの表で職種コードを引くため、G 列の職種は
 * この表の表記と完全一致していないと「_etc」になってしまう。
 */
export const SHEET_JOB_LABELS = [
  "農業",
  "建設",
  "介護",
  "外食",
  "飲食料品製造",
  "ビルクリーニング",
  "リネンサプライ",
  "自動車整備",
  "機械加工",
  "工業製品製造",
  "ドライブ",
  "宿泊",
] as const;

/** 系の分野名 → スプシの職種ラベル。長い語から順に照合する */
const JOB_ALIASES: [string, string][] = [
  ["飲食料品製造", "飲食料品製造"],
  ["工業製品製造", "工業製品製造"],
  ["工業製品", "工業製品製造"],
  ["ビルクリーニング", "ビルクリーニング"],
  ["リネンサプライ", "リネンサプライ"],
  ["自動車整備", "自動車整備"],
  ["自動車運送", "ドライブ"],
  ["ドライバー", "ドライブ"],
  ["ドライブ", "ドライブ"],
  ["機械加工", "機械加工"],
  ["外食", "外食"],
  ["介護", "介護"],
  ["建設", "建設"],
  ["農業", "農業"],
  ["宿泊", "宿泊"],
];

/**
 * 系の分野名をスプシの職種ラベルに揃える (例: 工業製品製造業 → 工業製品製造)。
 * 案件に分野が無ければ企業の分野で補う。どちらも読めなければ null。
 */
export function normalizeJobLabel(
  field: string | null | undefined,
  fallback?: string | null,
): string | null {
  for (const src of [field, fallback]) {
    const f = (src ?? "").trim();
    if (!f) continue;
    for (const [key, label] of JOB_ALIASES) if (f.includes(key)) return label;
  }
  return null;
}

/** スプシの職種表に載っている表記か */
function isSheetJobLabel(v: string): boolean {
  return (SHEET_JOB_LABELS as readonly string[]).includes(v.trim());
}

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
  /** 企業の分野。案件に分野が無いとき職種の補完に使う */
  companyIndustry?: string | null;
  ownerName: string | null;
  partnerName: string | null;
};

/** 企業マスタへの追記対象 */
export type CompanyForMaster = {
  externalId: string | null;
  name: string;
  industry: string | null;
};

/** 企業名の表記ゆれを吸収する (空白・ハイフン・中黒の違いを無視) */
function normalizeCompanyName(name: string | null | undefined): string {
  return String(name ?? "").replace(/[-－‐–—・\s　]/g, "").toLowerCase();
}

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
  /** 案件IDが空だった既存行を、企業IDで突き合わせて引き取った分 (重複行を作らないため) */
  adopted: { dealNo: string; row: number; company: string }[];
  /** 案件ID は在るが企業IDが食い違うため触らなかった行 */
  conflicts: { dealNo: string; row: number; sheetCompany: string; systemCompany: string }[];
  skipped: { dealId: number; company: string; reason: string }[];
  unchanged: number;
  /** 系に記録する 案件ID の割り当て (Deal.sheetDealNo に保存する) */
  assignments: { dealId: number; sheetDealNo: string }[];
  /** 数式を補修したセル (例: "C40") */
  repairedFormulas: string[];
  /**
   * 既存行を引き取ったとき、系が未入力(0)でスプシに実績がある人数は
   * スプシを消さずに系へ取り込む。呼び出し側が Deal に保存する。
   */
  pullbacks: { dealId: number; field: CountField; value: number }[];
};

/** スプシから系へ取り込める人数の項目 */
export type CountField = "requiredCount" | "recommendedCount" | "interviewCount" | "offerCount";

export type DealSyncPlan = {
  result: DealSyncResult;
  updates: { range: string; values: (string | number)[][] }[];
  /**
   * 数式が抜けているセルの補修。
   * 案件管理は C/D/E が数式だが、途中の行で数式が消えていることがある
   * (実例: 行40 の C 列だけ空で、企業IDが引けていなかった)。
   * 上にある同じ列の数式をコピーして埋める (値は書かない)。
   */
  formulaRepairs: { row: number; col: number; fromRow: number }[];
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
  /** C/D/E 列の数式 (valueRenderOption=FORMULA で読んだもの)。補修の判定に使う */
  formulas?: string[][];
}): DealSyncPlan {
  const { headerRow, rows, deals, tab, apply, formulas } = args;

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

  // 案件IDが空のまま残っている行 (デモ行や手入力途中の行)。
  // 企業IDで一意に対応づく案件があれば、新しい行を足さずにこの行を使う。
  const idlessByCompany = new Map<string, { row: number; cells: string[] }[]>();
  for (let i = headerRow; i < rows.length; i++) {
    const cells = rows[i] ?? [];
    const no = String(cells[DEAL_COL.dealNo] ?? "").trim();
    const cid = String(cells[DEAL_COL.companyId] ?? "").trim().toLowerCase();
    const cname = String(cells[DEAL_COL.companyName] ?? "").trim();
    if (no || !cid || !cname) continue;
    if (!idlessByCompany.has(cid)) idlessByCompany.set(cid, []);
    idlessByCompany.get(cid)!.push({ row: i + 1, cells });
  }

  const result: DealSyncResult = {
    apply,
    sheetRowCount: byDealNo.size,
    updated: [],
    appended: [],
    adopted: [],
    conflicts: [],
    skipped: [],
    unchanged: 0,
    assignments: [],
    repairedFormulas: [],
    pullbacks: [],
  };
  const updates: { range: string; values: (string | number)[][] }[] = [];
  const formulaRepairs: { row: number; col: number; fromRow: number }[] = [];

  /** この行の数式列 (C/D/E) が抜けていれば、上の行からコピーする予定を積む */
  const repairFormulas = (row: number) => {
    if (!formulas) return; // ドライラン用の呼び出しでは数式情報が無い
    for (const col of FORMULA_COLS) {
      const here = String(formulas[row - 1]?.[col - DEAL_COL.companyId] ?? "").trim();
      if (here.startsWith("=")) continue;
      // 数式は無くても値が手入力されているセル (例: 行23 の企業ID) は人の意図なので触らない
      if (String(rows[row - 1]?.[col] ?? "").trim()) continue;
      // 上に向かって、同じ列に数式がある最も近い行を探す
      let from = -1;
      for (let r = row - 1; r > headerRow; r--) {
        if (String(formulas[r - 1]?.[col - DEAL_COL.companyId] ?? "").trim().startsWith("=")) {
          from = r;
          break;
        }
      }
      if (from < 0) continue;
      formulaRepairs.push({ row, col, fromRow: from });
      result.repairedFormulas.push(`${colLetter(col)}${row}`);
    }
  };

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
        return normalizeJobLabel(d.field, d.companyIndustry) ?? "";
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

  /** 既存行が、この案件と同じ会社の行か (企業IDが空なら企業名で照合) */
  const isSameCompany = (cells: string[], d: DealForSheet): boolean => {
    const sheetCid = String(cells[DEAL_COL.companyId] ?? "").trim().toLowerCase();
    const sysCid = (d.companyExternalId ?? "").trim().toLowerCase();
    return sheetCid && sysCid
      ? sheetCid === sysCid
      : normalizeCompanyName(cells[DEAL_COL.companyName]) === normalizeCompanyName(d.companyName);
  };

  // 事前パス: 系の案件と対応づく既存行を洗い出す。
  // 対応づかない行 (スプシにだけある行) は、同じ会社の案件が 1 件だけ宙に浮いていれば
  // その案件の行として引き取る (前回ここを追記にしていたため重複行ができた)。
  const claimedRows = new Set<number>();
  const unmatchedByCompany = new Map<string, number>();
  for (const d of deals) {
    const key = d.sheetDealNo ? String(Number(d.sheetDealNo)) : String(d.id);
    const hit = byDealNo.get(key);
    if (hit && isSameCompany(hit.cells, d)) {
      claimedRows.add(hit.row);
    } else {
      const k = normalizeCompanyName(d.companyName);
      unmatchedByCompany.set(k, (unmatchedByCompany.get(k) ?? 0) + 1);
    }
  }
  /** 誰にも対応していない、案件ID付きの既存行 (会社名 → 行) */
  const orphanByCompany = new Map<string, { row: number; cells: string[]; no: string }[]>();
  for (const [no, hit] of byDealNo) {
    if (claimedRows.has(hit.row)) continue;
    const k = normalizeCompanyName(hit.cells[DEAL_COL.companyName]);
    if (!k) continue;
    if (!orphanByCompany.has(k)) orphanByCompany.set(k, []);
    orphanByCompany.get(k)!.push({ row: hit.row, cells: hit.cells, no });
  }

  /** 列 → 系の人数項目 */
  const COUNT_FIELD: Partial<Record<number, CountField>> = {
    [DEAL_COL.required]: "requiredCount",
    [DEAL_COL.recommended]: "recommendedCount",
    [DEAL_COL.interview]: "interviewCount",
    [DEAL_COL.offer]: "offerCount",
  };

  /**
   * 既存行を「初めて」自分の行として引き取るときの反映。
   * その行にはスプシ側の実績が入っていることがあり、系の案件は仮登録で人数が 0 のことが多い。
   * そのまま書くと実績を 0 で消してしまう (安達農園で実際に起きた) ので、
   * 系が 0 でスプシに数字があれば、スプシを残して系に取り込む。
   */
  const applyAdoption = (d: DealForSheet, row: number, cells: string[]) => {
    for (const col of UPDATABLE_COLS) {
      const next = valueFor(d, col);
      if (next === null || next === "") continue;
      const cur = String(cells[col] ?? "").trim();
      const field = COUNT_FIELD[col];
      if (field && next === 0) {
        const n = Number(cur);
        if (cur && Number.isFinite(n) && n > 0) {
          result.pullbacks.push({ dealId: d.id, field, value: n });
        }
        continue; // 0 は書き込まない
      }
      if (cur === (typeof next === "number" ? String(next) : next.trim())) continue;
      updates.push({ range: `${quote(tab)}!${colLetter(col)}${row}`, values: [[next]] });
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
    repairFormulas(row);
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
      // 同じ会社の行か。企業ID(C)が数式抜けで空のことがあるので、その場合は企業名(B)で照合する
      const sameCompany =
        sheetCid && sysCid
          ? sheetCid === sysCid
          : normalizeCompanyName(hit.cells[DEAL_COL.companyName]) ===
            normalizeCompanyName(d.companyName);
      // 以前この案件用に書いた行か (Deal.sheetDealNo に記録済み)
      const owned = Boolean(d.sheetDealNo) && Number(d.sheetDealNo) === Number(key);

      if (!sameCompany && owned) {
        // 自分の行のはずなのに会社が違う = 誰かが手で行を書き換えた可能性。
        // ここで追記すると毎回重複行が増えるので、何もせず報告だけする。
        result.conflicts.push({
          dealNo: formatDealNo(Number(key)),
          row: hit.row,
          sheetCompany: `${sheetCid || "(空)"} ${hit.cells[DEAL_COL.companyName] ?? ""}`.trim(),
          systemCompany: `${sysCid || "(空)"} ${d.companyName}`.trim(),
        });
        continue;
      }
      if (!sysCid || !sameCompany) {
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
      // 職種は基本的に触らない (スプシ独自の表記)。ただし空欄や職種表に無い表記だと
      // 案件ID(D)が「_etc」になってしまうので、そのときだけ職種表の表記で埋める。
      const curJob = String(hit.cells[DEAL_COL.job] ?? "").trim();
      if (!isSheetJobLabel(curJob)) {
        const label = normalizeJobLabel(d.field, d.companyIndustry);
        if (label && label !== curJob) {
          changes.push(`G: ${curJob || "(空)"} → ${label}`);
          updates.push({ range: `${quote(tab)}!G${hit.row}`, values: [[label]] });
        }
      }
      repairFormulas(hit.row);
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

    // 案件IDは入っているが系の誰にも対応していない同じ会社の行が 1 行だけあり、
    // かつこの会社で宙に浮いている案件が 1 件だけなら、その行を引き取る。
    // (どちらかが複数あるとどれとどれが同じ案件か判断できないので、追記に回す)
    {
      const k = normalizeCompanyName(d.companyName);
      const orphans = orphanByCompany.get(k);
      if (orphans && orphans.length === 1 && unmatchedByCompany.get(k) === 1) {
        const o = orphans[0];
        orphanByCompany.delete(k);
        repairFormulas(o.row);
        applyAdoption(d, o.row, o.cells);
        const no = formatDealNo(Number(o.no));
        result.adopted.push({ dealNo: no, row: o.row, company: d.companyName });
        result.assignments.push({ dealId: d.id, sheetDealNo: no });
        continue;
      }
    }

    const dealNo = formatDealNo(usedDealNos.has(key) ? nextFreeNo() : Number(key));

    // 案件IDが空の行が、この企業でちょうど 1 行だけ残っていれば、それを使う。
    // (同じ企業の行が複数あるとどれか分からないので、その場合は普通に追記する)
    const cid = d.companyExternalId.trim().toLowerCase();
    const candidates = idlessByCompany.get(cid);
    if (candidates && candidates.length === 1) {
      const hit = candidates[0];
      idlessByCompany.delete(cid); // 二重に使わない
      // 空いていた案件IDを書き込んで、以後この行と対応づける
      updates.push({
        range: `${quote(tab)}!${colLetter(DEAL_COL.dealNo)}${hit.row}`,
        values: [[dealNo]],
      });
      // 進捗も反映する (人数は系が 0 ならスプシの実績を残して系へ取り込む)
      applyAdoption(d, hit.row, hit.cells);
      repairFormulas(hit.row);
      usedDealNos.add(String(Number(dealNo)));
      result.adopted.push({ dealNo, row: hit.row, company: d.companyName });
      result.assignments.push({ dealId: d.id, sheetDealNo: dealNo });
      continue;
    }

    appendDeal(d, dealNo);
  }

  return { result, updates, formulaRepairs };
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

  // 数式が抜けたセルを見つけるため、C/D/E 列は計算結果ではなく数式そのものを読む
  const formulaRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${quote(tab)}!C1:E2000`,
    valueRenderOption: "FORMULA",
  });
  const formulas = (formulaRes.data.values ?? []).map((r) => r.map((c) => String(c ?? "")));

  const { result, updates, formulaRepairs } = planDealSync({
    headerRow,
    rows,
    deals,
    tab,
    apply,
    formulas,
  });

  if (apply && updates.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: { valueInputOption: "USER_ENTERED", data: updates },
    });
  }

  // 数式の補修: 上の行の数式をコピーする (PASTE_FORMULA なので参照行は自動で合う)
  if (apply && formulaRepairs.length > 0) {
    const meta = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: "sheets.properties(sheetId,title)",
    });
    const sheetId = meta.data.sheets?.find((x) => x.properties?.title === tab)?.properties?.sheetId;
    if (sheetId !== undefined && sheetId !== null) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: formulaRepairs.map((f) => ({
            copyPaste: {
              source: {
                sheetId,
                startRowIndex: f.fromRow - 1,
                endRowIndex: f.fromRow,
                startColumnIndex: f.col,
                endColumnIndex: f.col + 1,
              },
              destination: {
                sheetId,
                startRowIndex: f.row - 1,
                endRowIndex: f.row,
                startColumnIndex: f.col,
                endColumnIndex: f.col + 1,
              },
              pasteType: "PASTE_FORMULA",
            },
          })),
        },
      });
    }
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
