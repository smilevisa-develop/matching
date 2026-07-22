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
    createdAt, // B 追加日付
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
    birth, // P 生年月日
    visaExpiry, // Q ビザ期限
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

  // ── システム側で変更があったものだけに絞る ──
  const allCandidates = args.candidates;
  const candidates = allCandidates.filter(hasSystemChange);
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

  // 既存の全行を読む (A〜W)
  const existingRes = await sheets.spreadsheets.values.get({
    spreadsheetId: opts.spreadsheetId,
    range: `${quoteSheetName(sheetName)}!A:W`,
  });
  const existingRows: string[][] = (existingRes.data.values ?? []) as string[][];

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
      const existing = existingRows[rowNumber - 1] ?? [];
      // 列単位マージ: 系に値があればそれを採用、系が空欄なら既存値を残す
      const merged: (string | number)[] = systemRow.map((v, col) => {
        const sys = cellStr(v);
        return sys !== "" ? v : (existing[col] ?? "");
      });
      const diffs: { column: string; before: string; after: string }[] = [];
      merged.forEach((v, col) => {
        const before = cellStr(existing[col]);
        const after = cellStr(v);
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
      appends.push(systemRow);
      syncedPersonIds.push(p.id);
      if (sampleChanges.length < sampleLimit) {
        sampleChanges.push({ id: idStr, action: "append", name: p.name });
      }
    }
  }

  if (opts.apply) {
    if (updates.length > 0) {
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
