import "dotenv/config";
import * as XLSX from "xlsx";
import * as path from "path";

const FILE = process.env.FILE || `${process.env.HOME}/Downloads/候補者データベース (1).xlsx`;

function readSheet(filePath: string, sheetName: string): unknown[][] {
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets[sheetName];
  if (!sheet) throw new Error(`シートが見つかりません: ${sheetName} in ${filePath}`);
  return XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false }) as unknown[][];
}

function s(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const str = String(v).trim();
  return str.length === 0 ? null : str;
}

async function main() {
  console.log("ファイル:", FILE);
  console.log("---");
  const wb = XLSX.readFile(FILE);
  console.log("シート一覧:", wb.SheetNames.join(", "));
  console.log("---");

  // DB シート分析
  const dbRows = readSheet(FILE, "DB");
  const dbHeaderRow = (dbRows[1] ?? []) as unknown[];
  const headers = dbHeaderRow.map((h) => (h ? String(h).replace(/\s+/g, "").replace(/\n/g, "") : null));
  console.log("DB シート: 全", dbRows.length - 2, "行 (ヘッダ除く)");
  console.log("ヘッダ:", headers.filter(Boolean).slice(0, 20).join(" | "));

  const idIdx = headers.findIndex((h) => h === "ID");
  const nameIdx = headers.findIndex((h) => h === "カタカナ名");
  const engNameIdx = headers.findIndex((h) => h === "候補者名");
  const photoIdx = headers.findIndex((h) => h === "顔写真");
  const partnerIdx = headers.findIndex((h) => h === "パートナー");
  console.log("列インデックス: ID=", idIdx, ", カタカナ名=", nameIdx, ", 候補者名=", engNameIdx, ", 顔写真=", photoIdx, ", パートナー=", partnerIdx);

  if (idIdx === -1) {
    console.log("⚠️ ID 列が見つかりません");
    return;
  }

  const ids: number[] = [];
  const idSummary: { id: number; name: string; hasPhoto: boolean; partner: string | null }[] = [];
  for (let i = 2; i < dbRows.length; i++) {
    const row = dbRows[i] as unknown[];
    const idStr = s(row[idIdx]);
    if (!idStr) continue;
    const n = Number(idStr);
    if (!Number.isFinite(n)) continue;
    ids.push(n);
    idSummary.push({
      id: n,
      name: s(row[nameIdx]) || s(row[engNameIdx]) || "?",
      hasPhoto: !!s(row[photoIdx]),
      partner: s(row[partnerIdx]),
    });
  }
  ids.sort((a, b) => a - b);
  console.log("\nID 統計:");
  console.log("  件数:", ids.length);
  console.log("  最小 ID:", ids[0]);
  console.log("  最大 ID:", ids[ids.length - 1]);

  const dbCurrentMax = 191;
  const newIds = ids.filter((id) => id > dbCurrentMax);
  console.log(`\nDB の現在最大 ID (${dbCurrentMax}) より大きい = 新規対象:`, newIds.length, "件");
  console.log("新規対象 ID:", newIds.slice(0, 30).join(", ") + (newIds.length > 30 ? "..." : ""));

  console.log("\n新規対象の詳細 (先頭 10 件):");
  for (const item of idSummary.filter((it) => it.id > dbCurrentMax).slice(0, 10)) {
    console.log(`  ID=${item.id} ${item.name} 写真=${item.hasPhoto ? "あり" : "無し"} パートナー=${item.partner ?? "?"}`);
  }

  // 履歴書収集フォーム シートも分析 (photoUrl の源)
  console.log("\n=== 履歴書収集フォーム シート ===");
  const formRows = readSheet(FILE, "履歴書収集フォーム");
  console.log("行数:", formRows.length);
  const formHeaderRow = (formRows[0] ?? []) as unknown[];
  const formHeaders = formHeaderRow.map((h) => (h ? String(h).replace(/\s+/g, "").replace(/\n/g, "") : null));
  console.log("ヘッダ (先頭 20):", formHeaders.filter(Boolean).slice(0, 20).join(" | "));

  const fKanaIdx = formHeaders.findIndex((h) => h === "カタカナ名");
  const fPhotoIdx = formHeaders.findIndex((h) => h === "顔写真");
  const fTsIdx = formHeaders.findIndex((h) => h === "タイムスタンプ");
  console.log("列インデックス: カタカナ名=", fKanaIdx, ", 顔写真=", fPhotoIdx, ", タイムスタンプ=", fTsIdx);

  // タイムスタンプの新しい順に並べてサンプル
  const formEntries: { kana: string; photo: string | null; ts: string | null }[] = [];
  for (let i = 1; i < formRows.length; i++) {
    const row = formRows[i] as unknown[];
    const kana = s(row[fKanaIdx]);
    if (!kana) continue;
    formEntries.push({
      kana,
      photo: s(row[fPhotoIdx]),
      ts: s(row[fTsIdx]),
    });
  }
  console.log("フォーム回答 (有効カナ名のみ):", formEntries.length, "件");
  console.log("--- 直近 10 件 (末尾) ---");
  for (const e of formEntries.slice(-10)) {
    console.log(`  ${e.ts ?? "?"} ${e.kana} 写真=${e.photo ? "あり" : "無し"}`);
  }
}

main().catch(console.error);
