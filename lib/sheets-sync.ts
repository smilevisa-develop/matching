/**
 * Google Sheets 同期ヘルパー。
 *
 * 用途: 系 → スプシ の 一方向 差分同期。
 *
 * 対象:
 *   環境変数 SYNC_SHEET_URL で指定された Google Sheets の
 *   「DB」シート (請求シート・管理シートが参照する正規のマスタ)
 *   ※旧: 「!バックアップ!」シート → 2026-07-09 に DB へ切替
 *
 * 同期方針 (2026-07-16 に全上書き → 差分更新へ変更):
 *   - A 列の候補者 ID で行を突合する
 *   - 既存行は、系に値がある列だけ書き換える。系が空欄の列は既存値を残す
 *   - 系にいる新規候補者だけ末尾に追記する
 *   - スプシにしか無い行 (旧 Google フォーム由来 / 「IDなし」/「5月」等の区切り行)
 *     およびヘッダ行は 一切触らない
 *   - X 列より右 (請求シート用の追加列など) も触らない
 *
 * 列構成 (23 列、既存 候補者データベース.xlsx の DB シートに準拠):
 *   A ID / B 追加日付 / C 候補者名 (英語) / D カタカナ名 / E 分野 /
 *   F パートナー / G 推薦先企業 / H 状況 / I 性別 / J 国籍 /
 *   K 在留資格 / L 都道府県 / M 現住所 / N 郵便番号 / O 年齢 /
 *   P 生年月日 / Q ビザ期限 / R 特定技能経過年数 / S 実習経験有無 / T 日本語レベル /
 *   U 現職の手取り額 / V 履歴書 / W 書類フォルダリンク
 */

import { google, type sheets_v4 } from "googleapis";
import { formatPersonIdPrefix } from "@/lib/google-docs";
import { calculateAge } from "@/lib/candidate-profile";

/** 書き込み先シート名 (正規の DB シート) */
export const SYNC_SHEET_TAB_NAME = "DB";

/** ヘッダは 2 行目、データは 3 行目から (既存 xlsx の慣習に準拠) */
export const HEADER_ROW = 2;
export const DATA_START_ROW = 3;

/**
 * 日付が入る列の index (0 始まり)。B 追加日付 / P 生年月日 / Q ビザ期限。
 * これらは スプシ上で「日付セル」として扱われているため、
 * 文字列として書き込むと請求シート等の日付計算が壊れる。
 * 書式を YYYY/MM/DD に揃えたうえで USER_ENTERED で書き込み、日付型を維持する。
 */
export const DATE_COLUMN_INDEXES = [1, 15, 16] as const;

/**
 * "2026-04-04" / "2026-4-4" → "2026/04/04" に揃える。
 * 日付として解釈できない文字列 (「2026年4月」等) はそのまま返す。
 */
export function toSheetDate(value: string): string {
  const v = (value ?? "").trim();
  if (!v) return "";
  const m = v.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (!m) return v;
  const [, y, mo, d] = m;
  return `${y}/${mo.padStart(2, "0")}/${d.padStart(2, "0")}`;
}

/** Google Sheets のシリアル値の起点 (Excel 互換: 1899-12-30) */
const SHEET_EPOCH_MS = Date.UTC(1899, 11, 30);

/** シリアル値 → "YYYY/MM/DD"。範囲外なら null */
export function serialToDateString(n: number): string | null {
  if (!Number.isFinite(n) || n <= 0 || n > 100000) return null;
  const d = new Date(SHEET_EPOCH_MS + Math.round(n) * 86400000);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}/${mo}/${day}`;
}

/** "YYYY/MM/DD" / "YYYY-MM-DD" → シリアル値。解釈できなければ null */
export function dateStringToSerial(value: string): number | null {
  const m = (value ?? "").trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (!m) return null;
  const [, y, mo, d] = m;
  const ms = Date.UTC(Number(y), Number(mo) - 1, Number(d));
  if (Number.isNaN(ms)) return null;
  return Math.round((ms - SHEET_EPOCH_MS) / 86400000);
}

/**
 * 比較用にセルの値を表示文字列へ正規化する。
 * UNFORMATTED_VALUE で読むと日付はシリアル値 (数値) で返るため、
 * 日付列の数値は日付文字列に直してから比べる。
 */
function normalizeCell(v: unknown, col: number): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") {
    if ((DATE_COLUMN_INDEXES as readonly number[]).includes(col)) {
      return serialToDateString(v) ?? String(v);
    }
    // ID や年齢は数値で入っていることがある。"0056" と 56 を同一視するため 0 埋めを外す
    return String(v);
  }
  const s = String(v).trim();
  if ((DATE_COLUMN_INDEXES as readonly number[]).includes(col)) return toSheetDate(s);
  // "0056" → "56" として比べる (型が違うだけで内容は同じ、を差分にしない)
  if (/^0\d+$/.test(s)) return String(Number(s));
  return s;
}

/** 23 列の見出し (A〜W の順) */
export const SYNC_HEADERS: string[] = [
  "ID",
  "追加日付",
  "候補者名",
  "カタカナ名",
  "分野",
  "パートナー",
  "推薦先企業",
  "状況",
  "性別",
  "国籍",
  "在留資格",
  "都道府県",
  "現住所",
  "郵便番号",
  "年齢",
  "生年月日",
  "ビザ期限",
  "特定技能経過年数",
  "実習経験\n有無",
  "日本語レベル",
  "現職の手取り額",
  "履歴書",
  "書類フォルダ\nリンク",
];

/** Google Sheets URL から Sheet ID を抜き出す */
export function parseSheetIdFromUrl(urlOrId: string): string | null {
  const s = urlOrId.trim();
  if (!s) return null;
  // /d/{id}/... のパスから
  const m1 = s.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (m1) return m1[1];
  // 生 ID 文字列 (44 文字前後の base64ish)
  if (/^[a-zA-Z0-9_-]{20,}$/.test(s)) return s;
  return null;
}

/** 認証済み Google Sheets クライアント */
export async function getSheetsClient(): Promise<sheets_v4.Sheets> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.trim();
  if (!email || !key) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY 未設定");
  }
  const auth = new google.auth.JWT({
    email,
    key: key.replace(/\\n/g, "\n"),
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive",
    ],
  });
  await auth.authorize();
  return google.sheets({ version: "v4", auth });
}

/** シート名を A1 表記でエスケープ */
function quoteSheetName(name: string): string {
  // Sheets の A1 記法では、記号を含むシート名はシングルクォートで囲む
  // シート名内のシングルクォートは 2 個にエスケープする
  return `'${name.replace(/'/g, "''")}'`;
}

/** 指定シートを検出 (見つからなければ null) */
export async function findSheetIdByName(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  sheetName: string
): Promise<number | null> {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets(properties(sheetId,title))",
  });
  const found = meta.data.sheets?.find((s) => s.properties?.title === sheetName);
  return found?.properties?.sheetId ?? null;
}

// ============================================================
// マッピング: Person → 23 列
// ============================================================

/** Person + relations から 23 列の値配列を作る */
export type PersonForSync = {
  id: number;
  name: string;
  nationality: string;
  residenceStatus: string;
  driveFolderUrl: string | null;
  createdAt: Date;
  /** 変更検知用。Person 自体の更新日時 */
  updatedAt?: Date;
  /** スプシへ最後に反映した日時。null なら未反映 */
  sheetSyncedAt?: Date | null;
  partner?: { name: string } | null;
  onboarding?: {
    englishName: string | null;
    birthDate: string | null;
    postalCode: string | null;
    address: string | null;
    updatedAt?: Date;
  } | null;
  resumeProfile?: {
    gender: string | null;
    visaExpiryDate: string | null;
    japaneseLevel: string | null;
    traineeExperience: string | null;
    preferenceNote: string | null;
    remarks: string | null;
    resumeFileUrl: string | null;
    updatedAt?: Date;
  } | null;
  /**
   * 推薦先候補 (Person ↔ Deal の DealCandidate)。
   * G 推薦先企業 (企業名カンマ区切り) と H 状況 (最新の stage) を導出する。
   * Prisma のリレーション名 `dealCandidates` に合わせている。
   */
  dealCandidates?: {
    stage: string;
    updatedAt: Date;
    deal: { company: { name: string } };
  }[];
};

function s(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

/** "分野: XXX" のような形式から XXX を抜き出す */
function extractLabel(text: string | null | undefined, label: string): string {
  if (!text) return "";
  const re = new RegExp(`${label}\\s*[:：]\\s*(.+)`);
  const m = text.match(re);
  return m ? m[1].split(/[,、\n]/)[0].trim() : "";
}

/** 住所文字列から都道府県を抜き出す */
function extractPrefecture(address: string | null | undefined): string {
  if (!address) return "";
  const m = address.match(/^(北海道|東京都|京都府|大阪府|.{2,3}?[県府])/);
  return m ? m[1] : "";
}

export function buildCandidateRow(p: PersonForSync): (string | number)[] {
  const idStr = formatPersonIdPrefix(p.id);
  const createdAt = p.createdAt.toISOString().slice(0, 10);
  const englishName = s(p.onboarding?.englishName);
  const partnerName = s(p.partner?.name);
  const gender = s(p.resumeProfile?.gender);
  const address = s(p.onboarding?.address);
  const prefecture = extractPrefecture(address);
  const birth = s(p.onboarding?.birthDate);
  const visaExpiry = s(p.resumeProfile?.visaExpiryDate);
  const japaneseLevel = s(p.resumeProfile?.japaneseLevel);
  const trainee = s(p.resumeProfile?.traineeExperience);
  const field = extractLabel(p.resumeProfile?.remarks ?? null, "分野");
  const salary = extractLabel(p.resumeProfile?.preferenceNote ?? null, "現職の手取り額");
  const resumeUrl = s(p.resumeProfile?.resumeFileUrl);
  const folderUrl = s(p.driveFolderUrl);
  const age = birth ? calculateAge(birth) : "";

  // 推薦先企業 / 状況 は DealCandidate から導出
  const sortedCandidates = (p.dealCandidates ?? [])
    .slice()
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  const recommendedCompanies = Array.from(
    new Set(sortedCandidates.map((c) => c.deal.company.name).filter(Boolean)),
  ).join(", ");
  const latestStage = sortedCandidates[0]?.stage ?? "";

  return [
    idStr, // A ID
    toSheetDate(createdAt), // B 追加日付 (スプシの書式 YYYY/MM/DD に揃える)
    englishName, // C 候補者名 (英語)
    p.name, // D カタカナ名
    field, // E 分野
    partnerName, // F パートナー
    recommendedCompanies, // G 推薦先企業 (DealCandidate → Deal → Company 名をカンマ区切り)
    latestStage, // H 状況 (最新の DealCandidate.stage)
    gender, // I 性別
    p.nationality, // J 国籍
    p.residenceStatus, // K 在留資格
    prefecture, // L 都道府県
    address, // M 現住所
    s(p.onboarding?.postalCode), // N 郵便番号
    age, // O 年齢
    toSheetDate(birth), // P 生年月日
    toSheetDate(visaExpiry), // Q ビザ期限
    "", // R 特定技能経過年数 (未実装)
    trainee, // S 実習経験有無
    japaneseLevel, // T 日本語レベル
    salary, // U 現職の手取り額
    resumeUrl, // V 履歴書
    folderUrl, // W 書類フォルダリンク
  ];
}

// ============================================================
// 同期の実行 (差分更新 / upsert 方式)
// ============================================================

export type SyncOptions = {
  spreadsheetId: string;
  sheetName?: string; // デフォルト SYNC_SHEET_TAB_NAME
  apply: boolean; // false ならドライラン
  /** sampleChanges に含める件数 (デフォルト 5) */
  sampleLimit?: number;
  /**
   * "changed" (既定): システム側で変更があった候補者だけを反映 (更新 + 追記)
   * "append-missing": 変更の有無を無視し、スプシに ID が無い候補者を追記するだけ。
   *   既存行は一切更新しない。移行時の取りこぼしを埋める用。
   */
  mode?: "changed" | "append-missing";
};

export type SyncResult = {
  ok: boolean;
  apply: boolean;
  sheetName: string;
  candidatesConsidered: number;
  /** システム側で変更がなく、対象外にした数 (スプシに触っていない) */
  skippedUnchanged: number;
  /** 既存行のうち値が変わって更新した数 */
  updated: number;
  /** 新規に追記した数 */
  appended: number;
  /** 変更なしでスキップした数 */
  unchanged: number;
  /** 更新/追記のプレビュー (先頭 sampleLimit 件)。列ごとの before/after 付き */
  sampleChanges: {
    id: string;
    action: "update" | "append";
    name: string;
    row?: number;
    diffs?: { column: string; before: string; after: string }[];
  }[];
  /** 列ごとの変更件数 (どの列が原因で更新が多いのか把握する用) */
  changesByColumn: Record<string, number>;
  /** スプシへ反映済みになった Person.id。呼び出し側で sheetSyncedAt を更新する */
  syncedPersonIds: number[];
  warnings: string[];
};

/** セル比較用の正規化 (undefined/null → "", 数値 → 文字列, trim) */
function cellStr(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

/**
 * この候補者が「システム側で変更されたか」を判定する。
 *
 * 本人 / onboarding / resumeProfile / 案件紐づけ のいずれかの updatedAt が
 * sheetSyncedAt より新しければ変更あり。sheetSyncedAt が null なら
 * 一度も反映していない = 変更ありとして扱う。
 */
export function hasSystemChange(p: PersonForSync): boolean {
  if (!p.sheetSyncedAt) return true;
  const synced = p.sheetSyncedAt.getTime();
  const stamps: number[] = [];
  if (p.updatedAt) stamps.push(p.updatedAt.getTime());
  if (p.onboarding?.updatedAt) stamps.push(p.onboarding.updatedAt.getTime());
  if (p.resumeProfile?.updatedAt) stamps.push(p.resumeProfile.updatedAt.getTime());
  for (const c of p.dealCandidates ?? []) stamps.push(c.updatedAt.getTime());
  return stamps.some((t) => t > synced);
}

/**
 * ID 列 (A 列) の実データを診断する。書き込みは一切しない。
 * 数値セルと文字列セルの混在、重複 ID を洗い出す用。
 */
export async function inspectSheetIdColumn(args: {
  spreadsheetId: string;
  sheetName?: string;
}): Promise<{
  totalRows: number;
  numberCells: number;
  textCells: number;
  duplicates: { id: string; rows: number[] }[];
  /** 末尾 25 行の生データ */
  tail: { row: number; value: string; type: string }[];
}> {
  const sheetName = args.sheetName ?? SYNC_SHEET_TAB_NAME;
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: args.spreadsheetId,
    range: `${quoteSheetName(sheetName)}!A:A`,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const rows: unknown[][] = (res.data.values ?? []) as unknown[][];

  let numberCells = 0;
  let textCells = 0;
  const idRows = new Map<string, number[]>();
  const all: { row: number; value: string; type: string }[] = [];

  for (let i = DATA_START_ROW - 1; i < rows.length; i++) {
    const raw = rows[i]?.[0];
    if (raw === undefined || raw === null || raw === "") continue;
    const type = typeof raw === "number" ? "数値" : "文字列";
    if (typeof raw === "number") numberCells++;
    else textCells++;
    const str = String(raw).trim();
    all.push({ row: i + 1, value: str, type });
    if (/^\d{1,6}$/.test(str)) {
      const key = str.padStart(4, "0");
      if (!idRows.has(key)) idRows.set(key, []);
      idRows.get(key)!.push(i + 1);
    }
  }

  const duplicates = [...idRows.entries()]
    .filter(([, r]) => r.length > 1)
    .map(([id, r]) => ({ id, rows: r }));

  return {
    totalRows: all.length,
    numberCells,
    textCells,
    duplicates,
    tail: all.slice(-25),
  };
}

/**
 * スプシ DB に行が無い候補者の 23 列データを返す (書き込みは一切しない)。
 * 手動でスプシに貼り付けるための TSV 生成に使う。
 */
export async function findMissingCandidateRows(args: {
  spreadsheetId: string;
  sheetName?: string;
  candidates: PersonForSync[];
}): Promise<{
  sheetName: string;
  /** スプシに存在した ID の数 */
  existingIdCount: number;
  missing: { id: string; name: string; row: (string | number)[] }[];
}> {
  const sheetName = args.sheetName ?? SYNC_SHEET_TAB_NAME;
  const sheets = await getSheetsClient();

  const sheetIdNumeric = await findSheetIdByName(sheets, args.spreadsheetId, sheetName);
  if (sheetIdNumeric === null) {
    throw new Error(`スプシ内にシート「${sheetName}」が見つかりません`);
  }

  // A 列 (ID) だけ読めば十分
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: args.spreadsheetId,
    range: `${quoteSheetName(sheetName)}!A:A`,
  });
  const rows: string[][] = (res.data.values ?? []) as string[][];

  const existingIds = new Set<string>();
  for (let i = DATA_START_ROW - 1; i < rows.length; i++) {
    const raw = cellStr(rows[i]?.[0]);
    if (/^\d{1,6}$/.test(raw)) existingIds.add(raw.padStart(4, "0"));
  }

  const missing: { id: string; name: string; row: (string | number)[] }[] = [];
  for (const p of args.candidates) {
    const idStr = formatPersonIdPrefix(p.id);
    if (existingIds.has(idStr)) continue;
    missing.push({ id: idStr, name: p.name, row: buildCandidateRow(p) });
  }

  return { sheetName, existingIdCount: existingIds.size, missing };
}

/**
 * 系 → スプシ DB の 変更分のみ 反映。
 *
 * 方針:
 *   - システム側で変更があった候補者 (hasSystemChange) だけを対象にする。
 *     触られていない候補者はスプシに一切書き込まない → 古いデータは保護される
 *   - 対象候補者のうち、スプシに ID がある行は 系に値がある列だけ 書き換える
 *     (系が空欄の列は既存値を残す)
 *   - スプシに ID が無い候補者は末尾に追記
 *   - スプシにしかない行 (旧 Google フォーム由来 / 「IDなし」/「5月」等の区切り行)
 *     およびヘッダ行、X 列より右は 一切触らない
 *
 * 反映に成功した候補者 ID は syncedPersonIds で返るので、呼び出し側で
 * Person.sheetSyncedAt を更新すること。
 */
export async function syncCandidatesUpsert(args: {
  opts: SyncOptions;
  candidates: PersonForSync[];
}): Promise<SyncResult> {
  const warnings: string[] = [];
  const { opts } = args;
  const sheetName = opts.sheetName ?? SYNC_SHEET_TAB_NAME;

  const mode = opts.mode ?? "changed";

  // ── 対象候補者を絞る ──
  // changed        : システム側で変更があったものだけ
  // append-missing : 全件を候補にし、後段でスプシに ID が無いものだけ追記する
  const allCandidates = args.candidates;
  const candidates =
    mode === "append-missing" ? allCandidates : allCandidates.filter(hasSystemChange);
  const skippedUnchanged = allCandidates.length - candidates.length;

  if (candidates.length === 0) {
    return {
      ok: true,
      apply: opts.apply,
      sheetName,
      candidatesConsidered: allCandidates.length,
      skippedUnchanged,
      updated: 0,
      appended: 0,
      unchanged: 0,
      sampleChanges: [],
      changesByColumn: {},
      syncedPersonIds: [],
      warnings,
    };
  }

  const sheets = await getSheetsClient();

  // シート存在確認
  const sheetIdNumeric = await findSheetIdByName(sheets, opts.spreadsheetId, sheetName);
  if (sheetIdNumeric === null) {
    throw new Error(`スプシ内にシート「${sheetName}」が見つかりません`);
  }

  // 既存の全行を読む (A〜W)。
  // UNFORMATTED_VALUE にすることで、セルが数値なのか文字列なのかを判別できる。
  // (スプシ側は ID や年齢が数値の行と文字列の行が混在しているため、
  //  書き戻すときに元の型へ合わせる必要がある)
  const existingRes = await sheets.spreadsheets.values.get({
    spreadsheetId: opts.spreadsheetId,
    range: `${quoteSheetName(sheetName)}!A:W`,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const existingRows: unknown[][] = (existingRes.data.values ?? []) as unknown[][];

  // ID (4桁 0 埋め) → シート行番号 (1-based)。データは 3 行目以降のみ対象。
  // 数字だけの ID の行だけマッチ対象にする ("IDなし" や "5月" の区切り行は自然と外れる)
  const idToRowNumber = new Map<string, number>();
  for (let i = DATA_START_ROW - 1; i < existingRows.length; i++) {
    const rawId = cellStr(existingRows[i]?.[0]);
    if (/^\d{1,6}$/.test(rawId)) {
      const key = rawId.padStart(4, "0");
      if (!idToRowNumber.has(key)) idToRowNumber.set(key, i + 1);
      else warnings.push(`スプシに ID ${key} の行が複数あります (行 ${idToRowNumber.get(key)} を使用)`);
    }
  }

  /**
   * 系の値を、既存セルの型に合わせた書き込み値に変換する。
   *   - 日付列: 既存が数値 (=日付セル) ならシリアル値で書く → 日付型を維持
   *   - 既存が数値の列 (ID / 年齢 など): 数値で書く → 右寄せ表示のまま
   *   - それ以外: 文字列のまま
   */
  const toWriteValue = (sysValue: string | number, col: number, existingCell: unknown) => {
    const sys = cellStr(sysValue);
    if (sys === "") return "";
    const existedNumber = typeof existingCell === "number";
    const existedEmpty = existingCell === undefined || existingCell === null || existingCell === "";

    if ((DATE_COLUMN_INDEXES as readonly number[]).includes(col)) {
      const serial = dateStringToSerial(sys);
      // 既存が日付セル、または空セル → シリアル値で書いて日付として扱わせる
      if (serial !== null && (existedNumber || existedEmpty)) return serial;
      return toSheetDate(sys);
    }
    if (existedNumber && /^\d+$/.test(sys)) return Number(sys);
    return sysValue;
  };

  const updates: { range: string; values: (string | number)[][] }[] = [];
  const appends: (string | number)[][] = [];
  const sampleChanges: SyncResult["sampleChanges"] = [];
  const changesByColumn: Record<string, number> = {};
  const sampleLimit = opts.sampleLimit ?? 5;
  const syncedPersonIds: number[] = [];
  let unchanged = 0;

  for (const p of candidates) {
    const systemRow = buildCandidateRow(p);
    const idStr = formatPersonIdPrefix(p.id);
    const rowNumber = idToRowNumber.get(idStr);

    if (rowNumber) {
      // append-missing モードでは既存行を一切触らない
      if (mode === "append-missing") {
        unchanged++;
        continue;
      }
      const existing = existingRows[rowNumber - 1] ?? [];
      // 列単位マージ:
      //   系に値がある → 既存セルの型に合わせて書き込む
      //   系が空欄     → 既存の値をそのまま (型も含めて) 残す
      const merged: (string | number)[] = systemRow.map((v, col) => {
        const sys = cellStr(v);
        if (sys === "") return (existing[col] ?? "") as string | number;
        return toWriteValue(v, col, existing[col]);
      });
      // 差分判定は表示文字列で行う。型だけの違い (56 と "0056") は差分にしない
      const diffs: { column: string; before: string; after: string }[] = [];
      merged.forEach((v, col) => {
        const before = normalizeCell(existing[col], col);
        const after = normalizeCell(v, col);
        if (before !== after) {
          const column = (SYNC_HEADERS[col] ?? `列${col + 1}`).replace(/\n/g, "");
          diffs.push({ column, before, after });
          changesByColumn[column] = (changesByColumn[column] ?? 0) + 1;
        }
      });
      if (diffs.length > 0) {
        updates.push({
          range: `${quoteSheetName(sheetName)}!A${rowNumber}:W${rowNumber}`,
          values: [merged],
        });
        syncedPersonIds.push(p.id);
        if (sampleChanges.length < sampleLimit) {
          sampleChanges.push({
            id: idStr,
            action: "update",
            name: p.name,
            row: rowNumber,
            diffs,
          });
        }
      } else {
        // スプシ側と既に同値。反映済みとして sheetSyncedAt を進めてよい
        unchanged++;
        syncedPersonIds.push(p.id);
      }
    } else {
      // 新規行には合わせる既存セルが無い。日付だけはシリアル値で書いて
      // 日付セルとして扱わせる (既存行と同じ見え方にするため)
      appends.push(systemRow.map((v, col) => toWriteValue(v, col, undefined)));
      syncedPersonIds.push(p.id);
      if (sampleChanges.length < sampleLimit) {
        sampleChanges.push({ id: idStr, action: "append", name: p.name });
      }
    }
  }

  if (opts.apply) {
    if (updates.length > 0) {
      // RAW で書く。数値は数値、文字列は文字列としてそのまま入るため、
      // toWriteValue で決めた型 (日付=シリアル値 / ID・年齢=数値 / 他=文字列) が保たれる。
      // USER_ENTERED だと "0056" が 56 に化けるので使わない。
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: opts.spreadsheetId,
        requestBody: {
          valueInputOption: "RAW",
          data: updates.map((u) => ({ range: u.range, values: u.values })),
        },
      });
    }
    if (appends.length > 0) {
      await sheets.spreadsheets.values.append({
        spreadsheetId: opts.spreadsheetId,
        range: `${quoteSheetName(sheetName)}!A:W`,
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: appends },
      });
    }
  }

  return {
    ok: true,
    apply: opts.apply,
    sheetName,
    candidatesConsidered: candidates.length,
    skippedUnchanged,
    updated: updates.length,
    appended: appends.length,
    unchanged,
    sampleChanges,
    changesByColumn,
    // apply したときだけ「反映済み」として返す (ドライランでは進めない)
    syncedPersonIds: opts.apply ? syncedPersonIds : [],
    warnings,
  };
}
