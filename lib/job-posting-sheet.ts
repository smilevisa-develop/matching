/**
 * 求人票をスプレッドシートの「求人テンプレート」(2026/10〜) から作る。
 *
 * テンプレートは B 列が項目名 (「雇用形態 ▼」など)、C 列が内容。テンプレートを企業フォルダにコピーして、
 * 項目名に合う求人の条件 (Deal.conditions) を C 列に入れる。
 * 「基本情報」「給与」などの見出しの行は飛ばす。同じ名前が見出しの中でだけ意味を持つもの
 * (寮の「有無」、海外からの応募の「応募可否」) は、見出しと合わせて探す。
 * テンプレートに「特記事項」の行が無く、特記事項が入っていれば、最後に行を足して入れる。
 */

import { getGoogleClients, parseGoogleDriveFolderId } from "@/lib/google-docs";
import { getSheetsClient } from "@/lib/sheets-sync";
import { JOB_CONDITION_FIELDS, JOB_CONDITION_GROUPS, migrateLegacyConditions, type ConditionsRecord } from "@/lib/job-conditions";

export function isSpreadsheetUrl(url: string | null | undefined): boolean {
  return /\/spreadsheets\/d\//.test(url ?? "");
}

function spreadsheetId(url: string): string {
  return url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1] ?? url.trim();
}

const norm = (v: string) => v.replace(/[▼\s　]/g, "");

/** 見出しの中でだけ使われる短い項目名 → 求人の条件の項目名 */
const SECTION_ALIASES: Record<string, Record<string, string>> = {
  寮: { 有無: "寮の有無" },
  海外からの応募: { 応募可否: "海外からの応募可否" },
};

/** 求人票に入れる値 (項目名 → 値)。社内メモは入れない */
export function jobPostingSheetValues(conditions: ConditionsRecord, extra: Record<string, string>): Record<string, string> {
  const c = migrateLegacyConditions(conditions);
  const out: Record<string, string> = {};
  for (const f of JOB_CONDITION_FIELDS) {
    if (f.key === "memo") continue;
    const v = typeof c[f.key] === "string" ? (c[f.key] as string).trim() : "";
    if (v) out[norm(f.label)] = v;
  }
  for (const [k, v] of Object.entries(extra)) if (v && !out[norm(k)]) out[norm(k)] = v;
  return out;
}

export async function createJobPostingSheet(args: {
  templateUrl: string;
  folderUrl: string | null;
  title: string;
  values: Record<string, string>;
}): Promise<{ documentId: string; documentUrl: string; filled: number }> {
  const { drive } = await getGoogleClients();
  const templateId = spreadsheetId(args.templateUrl);
  const folderId = args.folderUrl ? parseGoogleDriveFolderId(args.folderUrl) : null;

  // コピー → 企業フォルダへ移す (Google Docs の求人票と同じ 2 段階。直接 parents を指定すると権限エラーになることがある)
  const copied = await drive.files.copy({
    fileId: templateId,
    supportsAllDrives: true,
    requestBody: { name: args.title },
    fields: "id,parents",
  });
  const id = copied.data.id;
  if (!id) throw new Error("求人テンプレート (スプレッドシート) の複製に失敗しました");
  if (folderId) {
    await drive.files.update({
      fileId: id,
      addParents: folderId,
      removeParents: (copied.data.parents ?? []).join(",") || undefined,
      supportsAllDrives: true,
      fields: "id",
    });
  }

  const sheets = await getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: id, fields: "sheets.properties(sheetId,title)" });
  const first = meta.data.sheets?.[0]?.properties;
  const tab = first?.title ?? "Sheet1";
  const q = `'${tab.replace(/'/g, "''")}'`;
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: id, range: `${q}!A1:C300` });
  const rows = (res.data.values ?? []).map((r) => r.map((v) => String(v ?? "")));

  const groups = new Set<string>(JOB_CONDITION_GROUPS.map(norm));
  const data: { range: string; values: string[][] }[] = [];
  const used = new Set<string>();
  let section = "";
  let lastRow = 0;
  for (let i = 0; i < rows.length; i++) {
    const label = norm(rows[i][1] ?? "");
    if (!label) continue;
    lastRow = i;
    if (label === "項目") continue;
    if (groups.has(label)) {
      section = label;
      continue;
    }
    const key = SECTION_ALIASES[section]?.[label] ?? label;
    const value = args.values[norm(key)];
    if (value) {
      data.push({ range: `${q}!C${i + 1}`, values: [[value]] });
      used.add(norm(key));
    }
  }
  // テンプレートに無い「特記事項」は最後に行を足して入れる
  const notes = args.values[norm("特記事項")];
  if (notes && !used.has(norm("特記事項"))) {
    data.push({ range: `${q}!B${lastRow + 2}:C${lastRow + 2}`, values: [["特記事項", notes]] });
  }
  if (data.length > 0) {
    // RAW: 値をそのまま入れる (「=」で始まる文字を式として動かさない)
    await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: id, requestBody: { valueInputOption: "RAW", data } });
  }
  return { documentId: id, documentUrl: `https://docs.google.com/spreadsheets/d/${id}/edit`, filled: data.length };
}
