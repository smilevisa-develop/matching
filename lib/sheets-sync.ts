/**
 * Google Sheets 同期ヘルパー。
 *
 * 用途: 系 → スプシ の 一方向 同期 (系が真の情報源、スプシは閲覧用)。
 *
 * 対象:
 *   環境変数 SYNC_SHEET_URL で指定された Google Sheets の
 *   「DB」シート (正規のメインシート)
 *   ※旧: 「!バックアップ!」シート → 2026-07-09 に DB へ切替
 *
 * ⚠️ 全上書きなので、DB の A〜W 列 3 行目以降に手入力データがあれば消える。
 *    (G「推薦先企業」/ H「状況」は DealCandidate から導出するため、系が真の情報源)
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
  partner?: { name: string } | null;
  onboarding?: {
    englishName: string | null;
    birthDate: string | null;
    postalCode: string | null;
    address: string | null;
  } | null;
  resumeProfile?: {
    gender: string | null;
    visaExpiryDate: string | null;
    japaneseLevel: string | null;
    traineeExperience: string | null;
    preferenceNote: string | null;
    remarks: string | null;
    resumeFileUrl: string | null;
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
// 同期の実行
// ============================================================

export type SyncOptions = {
  spreadsheetId: string;
  sheetName?: string; // デフォルト SYNC_SHEET_TAB_NAME
  apply: boolean; // false ならドライラン
};

export type SyncResult = {
  ok: boolean;
  apply: boolean;
  sheetName: string;
  headerWritten: boolean;
  rowsWritten: number;
  candidatesConsidered: number;
  sampleRows: (string | number)[][];
  warnings: string[];
};

/**
 * ヘッダを書き込み (2 行目)、その下 (3 行目〜) に全候補者を並べる。
 * 全上書き方式: 既存データはクリアしてから書き直す。
 * → 差分更新にすると複雑度が上がるので、初期実装はシンプルに丸ごと書き直す。
 */
export async function syncAllCandidatesFullOverwrite(args: {
  opts: SyncOptions;
  candidates: PersonForSync[];
}): Promise<SyncResult> {
  const warnings: string[] = [];
  const { opts, candidates } = args;
  const sheetName = opts.sheetName ?? SYNC_SHEET_TAB_NAME;
  const sheets = await getSheetsClient();

  // シート存在確認
  const sheetIdNumeric = await findSheetIdByName(sheets, opts.spreadsheetId, sheetName);
  if (sheetIdNumeric === null) {
    throw new Error(`スプシ内にシート「${sheetName}」が見つかりません`);
  }

  // マッピング
  const rows = candidates.map((p) => buildCandidateRow(p));

  if (!opts.apply) {
    return {
      ok: true,
      apply: false,
      sheetName,
      headerWritten: false,
      rowsWritten: 0,
      candidatesConsidered: candidates.length,
      sampleRows: rows.slice(0, 3),
      warnings,
    };
  }

  // ヘッダ書き込み (2 行目)
  const headerRange = `${quoteSheetName(sheetName)}!A${HEADER_ROW}:W${HEADER_ROW}`;
  await sheets.spreadsheets.values.update({
    spreadsheetId: opts.spreadsheetId,
    range: headerRange,
    valueInputOption: "RAW",
    requestBody: { values: [SYNC_HEADERS] },
  });

  // データ範囲を一旦クリア (3 行目以降、A〜W)
  const dataRange = `${quoteSheetName(sheetName)}!A${DATA_START_ROW}:W`;
  await sheets.spreadsheets.values.clear({
    spreadsheetId: opts.spreadsheetId,
    range: dataRange,
  });

  // データ書き込み
  if (rows.length > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: opts.spreadsheetId,
      range: `${quoteSheetName(sheetName)}!A${DATA_START_ROW}:W${DATA_START_ROW + rows.length - 1}`,
      valueInputOption: "RAW",
      requestBody: { values: rows },
    });
  }

  return {
    ok: true,
    apply: true,
    sheetName,
    headerWritten: true,
    rowsWritten: rows.length,
    candidatesConsidered: candidates.length,
    sampleRows: rows.slice(0, 3),
    warnings,
  };
}
