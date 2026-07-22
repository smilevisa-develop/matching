/**
 * スプシ (xlsx エクスポート) にしか存在しない候補者を洗い出す。
 * 読み取りのみ。DB への書き込みは一切しない。
 *
 *   XLSX_FILE="/path/to/候補者データベース (6).xlsx" npx tsx scripts/find-sheet-only-candidates.ts
 */

import "dotenv/config";
import * as XLSX from "xlsx";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getDatabaseUrl } from "../lib/database-url";

const XLSX_FILE =
  process.env.XLSX_FILE || `${process.env.HOME}/Downloads/候補者データベース (6).xlsx`;

const cs = getDatabaseUrl();
if (!cs) throw new Error("DATABASE_URL is not set");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: cs }) });

/** 23 列の並び (A〜W) */
const COL = {
  id: 0,
  addedAt: 1,
  englishName: 2,
  kanaName: 3,
  field: 4,
  partner: 5,
  company: 6,
  status: 7,
  gender: 8,
  nationality: 9,
  residenceStatus: 10,
  prefecture: 11,
  address: 12,
  postalCode: 13,
  age: 14,
  birthDate: 15,
  visaExpiry: 16,
  sswYears: 17,
  trainee: 18,
  japaneseLevel: 19,
  salary: 20,
  resumeUrl: 21,
  folderUrl: 22,
} as const;

function cell(row: unknown[], idx: number): string {
  const v = row?.[idx];
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

async function main() {
  console.log("============================================");
  console.log("スプシにしかない候補者を検出 (読み取りのみ)");
  console.log(`XLSX: ${XLSX_FILE}`);
  console.log("============================================\n");

  const wb = XLSX.readFile(XLSX_FILE);
  const sheet = wb.Sheets["DB"];
  if (!sheet) throw new Error("DB シートが見つかりません");
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false }) as unknown[][];

  // 系の全 ID
  const persons = await prisma.person.findMany({
    select: { id: true, name: true, onboarding: { select: { englishName: true } } },
  });
  const systemIds = new Set(persons.map((p) => String(p.id).padStart(4, "0")));
  // 名前でも突合できるように正規化キーを持つ
  const norm = (s: string) => s.replace(/[\s　]/g, "").toLowerCase();
  const systemNames = new Set<string>();
  for (const p of persons) {
    if (p.name) systemNames.add(norm(p.name));
    if (p.onboarding?.englishName) systemNames.add(norm(p.onboarding.englishName));
  }

  console.log(`系の候補者: ${persons.length} 件\n`);

  const sheetOnly: { rowNo: number; id: string; data: Record<string, string> }[] = [];
  const noId: { rowNo: number; data: Record<string, string> }[] = [];
  let sheetDataRows = 0;

  for (let i = 2; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const rawId = cell(r, COL.id);
    const english = cell(r, COL.englishName);
    const kana = cell(r, COL.kanaName);
    // 名前が両方空 = 区切り行 (「5月」など) とみなしてスキップ
    if (!english && !kana) continue;
    sheetDataRows++;

    const data: Record<string, string> = {
      追加日付: cell(r, COL.addedAt),
      候補者名: english,
      カタカナ名: kana,
      分野: cell(r, COL.field),
      パートナー: cell(r, COL.partner),
      推薦先企業: cell(r, COL.company),
      状況: cell(r, COL.status),
      性別: cell(r, COL.gender),
      国籍: cell(r, COL.nationality),
      在留資格: cell(r, COL.residenceStatus),
      都道府県: cell(r, COL.prefecture),
      現住所: cell(r, COL.address),
      郵便番号: cell(r, COL.postalCode),
      生年月日: cell(r, COL.birthDate),
      ビザ期限: cell(r, COL.visaExpiry),
      実習経験有無: cell(r, COL.trainee),
      日本語レベル: cell(r, COL.japaneseLevel),
      現職の手取り額: cell(r, COL.salary),
      履歴書: cell(r, COL.resumeUrl),
      書類フォルダリンク: cell(r, COL.folderUrl),
    };

    if (!/^\d{1,6}$/.test(rawId)) {
      // ID が「IDなし」等。名前で系に居るか確認
      const inSystem = systemNames.has(norm(english)) || systemNames.has(norm(kana));
      if (!inSystem) noId.push({ rowNo: i + 1, data });
      continue;
    }

    const id = rawId.padStart(4, "0");
    if (!systemIds.has(id)) {
      sheetOnly.push({ rowNo: i + 1, id, data });
    }
  }

  console.log(`スプシのデータ行: ${sheetDataRows} 件\n`);

  console.log("=== ① スプシに ID があるが、系に居ない ===");
  if (sheetOnly.length === 0) {
    console.log("  なし\n");
  } else {
    for (const s of sheetOnly) {
      console.log(`  行${s.rowNo} ID=${s.id} ${s.data.候補者名} / ${s.data.カタカナ名}`);
      console.log(`    国籍=${s.data.国籍} 在留資格=${s.data.在留資格} 追加日=${s.data.追加日付}`);
    }
    console.log("");
  }

  console.log("=== ② ID なしで、名前でも系に見つからない ===");
  if (noId.length === 0) {
    console.log("  なし\n");
  } else {
    for (const s of noId) {
      console.log(`  行${s.rowNo} ${s.data.候補者名} / ${s.data.カタカナ名}`);
      console.log(`    国籍=${s.data.国籍} 在留資格=${s.data.在留資格} 追加日=${s.data.追加日付}`);
    }
    console.log("");
  }

  console.log("============================================");
  console.log(`  ① ID あり・系に無い: ${sheetOnly.length} 件`);
  console.log(`  ② ID なし・名前でも見つからない: ${noId.length} 件`);
  console.log("============================================");
  console.log("\n🔍 検出のみ。DB は変更していません");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
