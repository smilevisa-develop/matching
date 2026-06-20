/**
 * DB に保存された broken な日付文字列 ("+036926-12" 等) を、
 * Excel serial として再解釈して "YYYY-MM-DD" に修正する。
 *
 * 対象テーブル / 列:
 *   PersonOnboarding.birthDate
 *   ResumeProfile.visaExpiryDate
 *   ResumeProfile.japaneseLevelDate
 *   ResumeProfile.licenseExpiryDate
 *   ResumeProfile.otherQualificationExpiryDate
 *   ResumeProfile.highSchoolStartDate
 *   ResumeProfile.highSchoolEndDate
 *   ResumeProfile.universityStartDate
 *   ResumeProfile.universityEndDate
 *
 * DRY_RUN=1 でプレビュー、本実行で更新。
 */

import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getDatabaseUrl } from "../lib/database-url";
import { normalizeToIsoDate, isBrokenExtendedIsoDate } from "../lib/date-normalize";

const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";

const cs = getDatabaseUrl();
if (!cs) throw new Error("DATABASE_URL is not set");
const adapter = new PrismaPg({ connectionString: cs });
const prisma = new PrismaClient({ adapter });

type Fix = { table: string; column: string; id: number; old: string; new: string };

async function main() {
  console.log("============================================");
  console.log("Broken date backfill");
  console.log(`DRY_RUN: ${DRY_RUN ? "✅" : "❌ (本実行)"}`);
  console.log("============================================\n");

  const fixes: Fix[] = [];
  const failures: { table: string; column: string; id: number; value: string }[] = [];

  // ── PersonOnboarding.birthDate ──
  const onbs = await prisma.personOnboarding.findMany({
    select: { id: true, personId: true, birthDate: true },
  });
  for (const o of onbs) {
    if (!isBrokenExtendedIsoDate(o.birthDate)) continue;
    const fixed = normalizeToIsoDate(o.birthDate);
    if (fixed) {
      fixes.push({ table: "PersonOnboarding", column: "birthDate", id: o.id, old: o.birthDate!, new: fixed });
    } else {
      failures.push({ table: "PersonOnboarding", column: "birthDate", id: o.id, value: o.birthDate! });
    }
  }

  // ── ResumeProfile の 各種日付列 ──
  const resumeCols = [
    "visaExpiryDate",
    "japaneseLevelDate",
    "licenseExpiryDate",
    "otherQualificationExpiryDate",
    "highSchoolStartDate",
    "highSchoolEndDate",
    "universityStartDate",
    "universityEndDate",
  ] as const;

  const resumes = await prisma.resumeProfile.findMany({
    select: {
      id: true,
      personId: true,
      visaExpiryDate: true,
      japaneseLevelDate: true,
      licenseExpiryDate: true,
      otherQualificationExpiryDate: true,
      highSchoolStartDate: true,
      highSchoolEndDate: true,
      universityStartDate: true,
      universityEndDate: true,
    },
  });

  for (const r of resumes) {
    for (const col of resumeCols) {
      const v = (r as unknown as Record<string, string | null>)[col];
      if (!isBrokenExtendedIsoDate(v)) continue;
      const fixed = normalizeToIsoDate(v);
      if (fixed) {
        fixes.push({ table: "ResumeProfile", column: col, id: r.id, old: v!, new: fixed });
      } else {
        failures.push({ table: "ResumeProfile", column: col, id: r.id, value: v! });
      }
    }
  }

  console.log(`修正対象: ${fixes.length} 件`);
  if (failures.length > 0) console.log(`変換不能: ${failures.length} 件`);

  if (fixes.length === 0 && failures.length === 0) {
    console.log("\n✅ broken date は見つかりませんでした");
    await prisma.$disconnect();
    return;
  }

  console.log("\n--- サンプル (先頭 10 件) ---");
  for (const f of fixes.slice(0, 10)) {
    console.log(`  ${f.table}.${f.column} (id=${f.id})  ${f.old}  →  ${f.new}`);
  }

  if (DRY_RUN) {
    console.log("\n🔍 DRY RUN — 変更しません");
    await prisma.$disconnect();
    return;
  }

  // 適用
  console.log("\n適用中...");
  for (const f of fixes) {
    const data: Record<string, string> = { [f.column]: f.new };
    if (f.table === "PersonOnboarding") {
      await prisma.personOnboarding.update({ where: { id: f.id }, data });
    } else if (f.table === "ResumeProfile") {
      await prisma.resumeProfile.update({ where: { id: f.id }, data });
    }
  }
  console.log(`✅ ${fixes.length} 件 修正完了`);

  if (failures.length > 0) {
    console.log("\n変換不能だった値 (要目視):");
    for (const f of failures) {
      console.log(`  ${f.table}.${f.column} (id=${f.id}): ${f.value}`);
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
