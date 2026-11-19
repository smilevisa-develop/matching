/**
 * 企業との商談の議事録 (Notta)。
 *
 * Notta には公開 API がないため、次の2段で取り込む (docs/notta-zapier-setup.md):
 *   1. Zapier (無料) が、Notta の AI 要約ができるたびに「Notta 議事録」スプシへ1行書き足す
 *   2. 企業の画面で「この会社の議事録を探す」を押すと、タイトルに企業名を含む行だけを MeetingNote に保存する
 *
 * スプシは 1 行目が見出し。列の順番は問わず、見出しの名前で読む (Zapier の設定で列が入れ替わっても動くように)。
 */

import { getSheetsClient, parseSheetIdFromUrl } from "@/lib/sheets-sync";

/** 見出しの名前 (左から、Zapier の設定で使う並び)。日本語・英語のどちらでも読む */
export const MEETING_SHEET_COLUMNS = {
  id: ["録音ID", "ID", "Record ID"],
  title: ["タイトル", "Title"],
  date: ["日時", "日付", "Date", "Created"],
  summary: ["要約", "AI要約", "Summary"],
  transcript: ["文字起こし", "Transcript"],
  url: ["URL", "リンク", "Link"],
} as const;

export type MeetingSheetRow = {
  sourceKey: string;
  title: string;
  dateText: string;
  meetingAt: Date | null;
  summary: string;
  transcript: string;
  url: string;
};

/** 比べるための形にそろえる: 全角/半角・大文字/小文字・空白・法人格の違いをなくす */
export function normalizeForMatch(value: string): string {
  return (value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/株式会社|有限会社|合同会社|合資会社|合名会社|一般社団法人|社会福祉法人|医療法人|\(株\)|\(有\)|\(同\)|㈱|㈲/g, "")
    .replace(/[\s・,，.。、()（）「」『』【】\-ー_]/g, "");
}

/** 企業名で探すときの語。法人格を外して2文字未満になる名前は、誤ってほかの商談に当たるので探さない */
export function companySearchKey(companyName: string): string | null {
  const key = normalizeForMatch(companyName);
  return key.length >= 2 ? key : null;
}

/** 議事録のタイトルに、その企業の名前が入っているか */
export function titleMatchesCompany(title: string, companyKey: string): boolean {
  return normalizeForMatch(title).includes(companyKey);
}

/** "2026/11/12 14:00" / "2026-11-12T14:00:00+09:00" / シリアル値 などを日時に。読めなければ null */
export function parseMeetingDate(value: string): Date | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  if (/^\d+(\.\d+)?$/.test(v)) {
    const n = Number(v);
    // スプシのシリアル値 (日付書式のセルを UNFORMATTED で読んだとき)
    if (n > 20000 && n < 100000) return new Date(Date.UTC(1899, 11, 30) + Math.round((n - 9 / 24) * 86400000));
    // Unix 時刻。Zapier の Notta「Create Time」は秒 (例: 1706794602)。ミリ秒にも対応
    if (n >= 1e9 && n < 1e11) return new Date(n * 1000);
    if (n >= 1e12 && n < 1e14) return new Date(n);
    return null;
  }
  // "2026/11/12 14:00" のようにタイムゾーンが無いものは日本時間とみなす
  const m = v.match(/^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})日?(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    const [, y, mo, d, h = "0", mi = "0", s = "0"] = m;
    return new Date(Date.UTC(+y, +mo - 1, +d, +h - 9, +mi, +s));
  }
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t);
}

function findColumn(header: string[], names: readonly string[]): number {
  const wanted = names.map((n) => normalizeForMatch(n));
  return header.findIndex((h) => wanted.includes(normalizeForMatch(h)));
}

/** スプシの値 (1行目が見出し) を行に。タイトルの無い行は飛ばす */
export function parseMeetingSheet(values: string[][]): MeetingSheetRow[] {
  const [header = [], ...rows] = values;
  const col = {
    id: findColumn(header, MEETING_SHEET_COLUMNS.id),
    title: findColumn(header, MEETING_SHEET_COLUMNS.title),
    date: findColumn(header, MEETING_SHEET_COLUMNS.date),
    summary: findColumn(header, MEETING_SHEET_COLUMNS.summary),
    transcript: findColumn(header, MEETING_SHEET_COLUMNS.transcript),
    url: findColumn(header, MEETING_SHEET_COLUMNS.url),
  };
  if (col.title < 0) {
    throw new Error("議事録スプシの1行目に「タイトル」の見出しがありません");
  }
  const cell = (row: string[], i: number) => (i >= 0 ? String(row[i] ?? "").trim() : "");
  return rows
    .map((row) => {
      const title = cell(row, col.title);
      const dateText = cell(row, col.date);
      const url = cell(row, col.url);
      const id = cell(row, col.id);
      return {
        sourceKey: id ? `id:${id}` : url ? `url:${url}` : `title:${title}|${dateText}`,
        title,
        dateText,
        meetingAt: parseMeetingDate(dateText),
        summary: cell(row, col.summary),
        transcript: cell(row, col.transcript),
        url,
      };
    })
    .filter((r) => r.title);
}

/** 議事録スプシを読む。NOTTA_SHEET_URL が無いときはエラー */
export async function readMeetingSheet(): Promise<MeetingSheetRow[]> {
  const sheetUrl = process.env.NOTTA_SHEET_URL?.trim();
  if (!sheetUrl) throw new Error("議事録スプシの URL (NOTTA_SHEET_URL) が設定されていません");
  const spreadsheetId = parseSheetIdFromUrl(sheetUrl);
  if (!spreadsheetId) throw new Error("NOTTA_SHEET_URL からスプシの ID を読めません");
  // タブ名を指定しなければ、いちばん左のタブを読む
  const tab = process.env.NOTTA_SHEET_TAB?.trim();
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: tab ? `'${tab.replace(/'/g, "''")}'!A:Z` : "A:Z",
    valueRenderOption: "FORMATTED_VALUE",
  });
  return parseMeetingSheet((res.data.values ?? []) as string[][]);
}
