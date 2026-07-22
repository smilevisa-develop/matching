/**
 * スプシ (xlsx) にしか存在しない候補者を、スプシの ID を保ったままシステムに取り込む。
 *
 *   DRY_RUN=1 npx tsx scripts/import-sheet-only-candidates.ts   # プレビュー
 *   npx tsx scripts/import-sheet-only-candidates.ts             # 本実行
 *   IDS=269,270 npx tsx scripts/import-sheet-only-candidates.ts # ID を絞って取り込み
 *
 * 方針:
 *   - スプシの ID をそのまま Person.id にする (系とスプシの ID を一致させる)
 *   - 同名の候補者が既にいる場合は 警告を出してスキップ (重複作成を防ぐ)
 *   - 取り込んだ候補者は sheetSyncedAt = 現在時刻 にする
 *     → 取り込み直後にスプシへ書き戻すことはない
 *   - 最後に Person_id_seq を最大値に進める (autoincrement の衝突防止)
 */

import "dotenv/config";
import * as XLSX from "xlsx";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getDatabaseUrl } from "../lib/database-url";

const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";
const XLSX_FILE =
  process.env.XLSX_FILE || `${process.env.HOME}/Downloads/候補者データベース (6).xlsx`;
const ID_FILTER = process.env.IDS
  ? new Set(
      process.env.IDS.split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n)),
    )
  : null;

const cs = getDatabaseUrl();
if (!cs) throw new Error("DATABASE_URL is not set");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: cs }) });

const COL = {
  id: 0, addedAt: 1, englishName: 2, kanaName: 3, field: 4, partner: 5,
  company: 6, status: 7, gender: 8, nationality: 9, residenceStatus: 10,
  prefecture: 11, address: 12, postalCode: 13, age: 14, birthDate: 15,
  visaExpiry: 16, sswYears: 17, trainee: 18, japaneseLevel: 19,
  salary: 20, resumeUrl: 21, folderUrl: 22,
} as const;

function cell(row: unknown[], idx: number): string {
  const v = row?.[idx];
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

/** Excel シリアル値 or 文字列 → "YYYY-MM-DD"。変換できなければ元の文字列 */
function toDateString(raw: string): string {
  if (!raw) return "";
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(raw)) return raw.replace(/\//g, "-").slice(0, 10);
  const serial = Number(raw);
  if (!Number.isFinite(serial) || serial <= 0 || serial > 100000) return raw;
  // Excel の epoch は 1899-12-30 (1900 うるう年バグ込み)
  const ms = Date.UTC(1899, 11, 30) + serial * 86400000;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toISOString().slice(0, 10);
}

const norm = (s: string) => s.replace(/[\s　]/g, "").toLowerCase();

async function main() {
  console.log("============================================");
  console.log("スプシ → システム 取り込み");
  console.log(`DRY_RUN: ${DRY_RUN ? "✅ (DB は変更しない)" : "❌ (本実行)"}`);
  if (ID_FILTER) console.log(`対象 ID: ${[...ID_FILTER].join(", ")}`);
  console.log("============================================\n");

  const wb = XLSX.readFile(XLSX_FILE);
  const sheet = wb.Sheets["DB"];
  if (!sheet) throw new Error("DB シートが見つかりません");
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false }) as unknown[][];

  const persons = await prisma.person.findMany({
    select: { id: true, name: true, onboarding: { select: { englishName: true } } },
  });
  const systemIds = new Set(persons.map((p) => p.id));
  const nameToId = new Map<string, number>();
  for (const p of persons) {
    if (p.name) nameToId.set(norm(p.name), p.id);
    if (p.onboarding?.englishName) nameToId.set(norm(p.onboarding.englishName), p.id);
  }

  const partners = await prisma.partner.findMany({ select: { id: true, name: true } });
  const partnerByName = new Map(partners.map((p) => [norm(p.name), p.id]));

  let created = 0;
  let skippedDup = 0;
  let planned = 0;

  for (let i = 2; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const rawId = cell(r, COL.id);
    if (!/^\d{1,6}$/.test(rawId)) continue;
    const id = Number(rawId);
    if (systemIds.has(id)) continue;
    if (ID_FILTER && !ID_FILTER.has(id)) continue;

    const english = cell(r, COL.englishName);
    const kana = cell(r, COL.kanaName);
    if (!english && !kana) continue;

    // 同名がすでに系に居ないか確認 (別 ID で登録済みの重複を防ぐ)
    const dupId = nameToId.get(norm(english)) ?? nameToId.get(norm(kana));
    if (dupId) {
      console.log(`⚠️ スキップ ID=${rawId} ${english || kana} — 同名が系に存在 (pid=${dupId})`);
      skippedDup++;
      continue;
    }

    const name = kana || english;
    const nationality = cell(r, COL.nationality) || "不明";
    const residenceStatus = cell(r, COL.residenceStatus) || "不明";
    const partnerName = cell(r, COL.partner);
    const partnerId = partnerName ? (partnerByName.get(norm(partnerName)) ?? null) : null;
    const createdAt = toDateString(cell(r, COL.addedAt));
    const birthDate = toDateString(cell(r, COL.birthDate));
    const visaExpiry = toDateString(cell(r, COL.visaExpiry));
    const field = cell(r, COL.field);
    const salary = cell(r, COL.salary);

    planned++;
    console.log(`${DRY_RUN ? "[DRY]" : "✅"} ID=${rawId} ${english} / ${kana}`);
    console.log(`      国籍=${nationality} 在留資格=${residenceStatus} 追加日=${createdAt || "-"}`);
    if (partnerName && !partnerId) {
      console.log(`      ⚠️ パートナー「${partnerName}」が系に見つからず未設定`);
    }

    if (DRY_RUN) continue;

    await prisma.person.create({
      data: {
        id,
        name,
        nationality,
        residenceStatus,
        channel: "未設定",
        partnerId,
        driveFolderUrl: cell(r, COL.folderUrl) || null,
        ...(createdAt ? { createdAt: new Date(`${createdAt}T00:00:00Z`) } : {}),
        // 取り込み直後にスプシへ書き戻さないよう反映済みにする
        sheetSyncedAt: new Date(),
        onboarding: {
          create: {
            englishName: english || null,
            birthDate: birthDate || null,
            postalCode: cell(r, COL.postalCode) || null,
            address: cell(r, COL.address) || null,
          },
        },
        resumeProfile: {
          create: {
            gender: cell(r, COL.gender) || null,
            visaExpiryDate: visaExpiry || null,
            japaneseLevel: cell(r, COL.japaneseLevel) || null,
            traineeExperience: cell(r, COL.trainee) || null,
            resumeFileUrl: cell(r, COL.resumeUrl) || null,
            // 分野 / 現職の手取り額 はスプシ出力時と同じ書式で保存する
            ...(field ? { remarks: `分野: ${field}` } : {}),
            ...(salary ? { preferenceNote: `現職の手取り額: ${salary}` } : {}),
          },
        },
      },
    });
    created++;
  }

  if (!DRY_RUN && created > 0) {
    await prisma.$executeRawUnsafe(
      `SELECT setval(pg_get_serial_sequence('"Person"', 'id'), (SELECT COALESCE(MAX(id), 1) FROM "Person"))`,
    );
    console.log("\n🔧 Person_id_seq を最大値に更新しました");
  }

  console.log("\n============================================");
  console.log(`  取り込み対象: ${planned} 件`);
  console.log(`  作成: ${created} 件`);
  console.log(`  同名スキップ: ${skippedDup} 件`);
  console.log("============================================");
  console.log("\n" + (DRY_RUN ? "🔍 DRY RUN — DB は変更していません" : "✅ 完了"));

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
