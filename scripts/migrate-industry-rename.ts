/**
 * 業種の旧名称を新名称に一括置換 (2024 改定準拠)。
 *
 * 対象:
 *   - Company.industry
 *   - Deal.field
 *   - Partner.introducibleFields (CSV: "介護,製造,建設" のような形式)
 *
 * 置換ルール:
 *   "素形材・産業機械・電気電子情報関連製造業" → "工業製品製造業"
 *   "素形材・産業機械・電気電子"              → "工業製品製造業"
 *   "製造"                                    → "工業製品製造業"
 *   "造船・舶用"                              → "造船・舶用工業"
 *   "外食"                                    → "外食業"
 *
 * DRY_RUN=1 でプレビュー、本実行で更新。
 */

import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getDatabaseUrl } from "../lib/database-url";

const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";

const RENAMES: Record<string, string> = {
  "素形材・産業機械・電気電子情報関連製造業": "工業製品製造業",
  "素形材・産業機械・電気電子": "工業製品製造業",
  "製造": "工業製品製造業",
  "造船・舶用": "造船・舶用工業",
  "外食": "外食業",
};

const cs = getDatabaseUrl();
if (!cs) throw new Error("DATABASE_URL is not set");
const adapter = new PrismaPg({ connectionString: cs });
const prisma = new PrismaClient({ adapter });

/** 単一値の置換 (旧名称ならマップ済みの新名称、他はそのまま) */
function renameOne(v: string | null | undefined): string | null | undefined {
  if (v === null || v === undefined) return v;
  const trimmed = v.trim();
  return RENAMES[trimmed] ?? v;
}

/** CSV 内の 各要素を置換 */
function renameCsv(csv: string | null | undefined): { changed: boolean; value: string | null } {
  if (!csv) return { changed: false, value: csv ?? null };
  const parts = csv.split(",").map((s) => s.trim()).filter(Boolean);
  const renamed = parts.map((p) => RENAMES[p] ?? p);
  const dedup = Array.from(new Set(renamed));
  const next = dedup.join(",");
  return { changed: next !== csv, value: next };
}

async function main() {
  console.log("============================================");
  console.log("業種 旧→新 マイグレーション");
  console.log(`DRY_RUN: ${DRY_RUN ? "✅" : "❌ (本実行)"}`);
  console.log("============================================\n");

  // 1. Company.industry
  const companies = await prisma.company.findMany({
    select: { id: true, name: true, industry: true },
  });
  let companyUpdated = 0;
  for (const c of companies) {
    if (!c.industry) continue;
    const next = renameOne(c.industry);
    if (next !== c.industry) {
      companyUpdated++;
      if (DRY_RUN) {
        console.log(`  [DRY] Company id=${c.id} ${c.name}: "${c.industry}" → "${next}"`);
      } else {
        await prisma.company.update({ where: { id: c.id }, data: { industry: next } });
        console.log(`  ✅ Company id=${c.id} ${c.name}: "${c.industry}" → "${next}"`);
      }
    }
  }

  // 2. Deal.field
  const deals = await prisma.deal.findMany({
    select: { id: true, title: true, field: true },
  });
  let dealUpdated = 0;
  for (const d of deals) {
    if (!d.field) continue;
    const next = renameOne(d.field);
    if (next !== d.field) {
      dealUpdated++;
      if (DRY_RUN) {
        console.log(`  [DRY] Deal id=${d.id} ${d.title}: "${d.field}" → "${next}"`);
      } else {
        await prisma.deal.update({ where: { id: d.id }, data: { field: next } });
        console.log(`  ✅ Deal id=${d.id} ${d.title}: "${d.field}" → "${next}"`);
      }
    }
  }

  // 3. Partner.introducibleFields (CSV)
  const partners = await prisma.partner.findMany({
    select: { id: true, name: true, introducibleFields: true },
  });
  let partnerUpdated = 0;
  for (const p of partners) {
    const { changed, value } = renameCsv(p.introducibleFields);
    if (changed) {
      partnerUpdated++;
      if (DRY_RUN) {
        console.log(`  [DRY] Partner id=${p.id} ${p.name}: "${p.introducibleFields}" → "${value}"`);
      } else {
        await prisma.partner.update({ where: { id: p.id }, data: { introducibleFields: value } });
        console.log(`  ✅ Partner id=${p.id} ${p.name}: "${p.introducibleFields}" → "${value}"`);
      }
    }
  }

  console.log("\n============================================");
  console.log("📊 サマリー");
  console.log("============================================");
  console.log(`  Company.industry: ${companyUpdated} 件 (対象 ${companies.length})`);
  console.log(`  Deal.field: ${dealUpdated} 件 (対象 ${deals.length})`);
  console.log(`  Partner.introducibleFields: ${partnerUpdated} 件 (対象 ${partners.length})`);
  console.log("\n" + (DRY_RUN ? "🔍 DRY RUN" : "✅ 完了"));

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
