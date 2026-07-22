/**
 * 系 → スプシ DB の差分同期を ドライラン で確認する。
 * スプシへの書き込みは一切行わない (apply: false 固定)。
 *
 *   npx tsx scripts/dryrun-sheet-upsert.ts
 */

import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getDatabaseUrl } from "../lib/database-url";
import {
  parseSheetIdFromUrl,
  syncCandidatesUpsert,
  SYNC_SHEET_TAB_NAME,
  type PersonForSync,
} from "../lib/sheets-sync";

const cs = getDatabaseUrl();
if (!cs) throw new Error("DATABASE_URL is not set");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: cs }) });

async function main() {
  const sheetUrl = process.env.SYNC_SHEET_URL?.trim();
  if (!sheetUrl) throw new Error("SYNC_SHEET_URL が未設定です");
  const spreadsheetId = parseSheetIdFromUrl(sheetUrl);
  if (!spreadsheetId) throw new Error("SYNC_SHEET_URL から Sheet ID を解析できません");

  const rawPersons = await prisma.person.findMany({
    orderBy: { id: "asc" },
    select: {
      id: true,
      name: true,
      nationality: true,
      residenceStatus: true,
      driveFolderUrl: true,
      createdAt: true,
      updatedAt: true,
      sheetSyncedAt: true,
      partner: { select: { name: true } },
      onboarding: {
        select: { englishName: true, birthDate: true, postalCode: true, address: true, updatedAt: true },
      },
      resumeProfile: {
        select: {
          gender: true,
          visaExpiryDate: true,
          japaneseLevel: true,
          traineeExperience: true,
          preferenceNote: true,
          remarks: true,
          resumeFileUrl: true,
          updatedAt: true,
        },
      },
      dealCandidates: {
        select: {
          stage: true,
          updatedAt: true,
          deal: { select: { company: { select: { name: true } } } },
        },
        orderBy: { updatedAt: "desc" },
      },
    },
  });
  const candidates: PersonForSync[] = rawPersons;

  console.log("============================================");
  console.log("スプシ差分同期 ドライラン (書き込みなし)");
  console.log(`シート: ${SYNC_SHEET_TAB_NAME}`);
  console.log("============================================\n");

  const result = await syncCandidatesUpsert({
    opts: { spreadsheetId, sheetName: SYNC_SHEET_TAB_NAME, apply: false },
    candidates,
  });

  console.log(`系の候補者: ${result.candidatesConsidered} 件`);
  console.log(`  変更なしで対象外: ${result.skippedUnchanged} 件 (スプシに触らない)`);
  console.log(`  更新予定: ${result.updated} 件`);
  console.log(`  追記予定: ${result.appended} 件`);
  console.log(`  変更なし: ${result.unchanged} 件`);
  if (result.sampleChanges.length > 0) {
    console.log("\nサンプル:");
    for (const c of result.sampleChanges) {
      console.log(`  [${c.action === "update" ? "更新" : "追記"}] ID=${c.id} ${c.name}`);
    }
  }
  if (result.warnings.length > 0) {
    console.log("\n⚠️ 警告:");
    for (const w of result.warnings) console.log(`  ${w}`);
  }
  console.log("\n🔍 ドライラン完了 — スプシは変更していません");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
