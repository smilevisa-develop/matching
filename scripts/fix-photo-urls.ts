/**
 * photoUrl が Drive シェア URL (open?id=XXX や file/d/XXX/view) のまま保存されている
 * 候補者を、サムネ URL (thumbnail?id=XXX&sz=w400) に一括変換する。
 *
 * 元の URL 形式は表示できないが、サムネ URL は <img> から直接読める。
 * 既に thumbnail 形式になっている候補者は触らない。
 *
 * DRY_RUN=1 でプレビューのみ。
 */

import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getDatabaseUrl } from "../lib/database-url";
import { toDriveThumbUrl } from "../lib/drive-url";

const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";

const cs = getDatabaseUrl();
if (!cs) throw new Error("DATABASE_URL is not set");
const adapter = new PrismaPg({ connectionString: cs });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("============================================");
  console.log("photoUrl を Drive サムネ URL に正規化");
  console.log(`DRY_RUN: ${DRY_RUN ? "✅" : "❌ (本実行)"}`);
  console.log("============================================\n");

  const all = await prisma.person.findMany({
    where: { photoUrl: { not: null } },
    select: { id: true, name: true, photoUrl: true },
    orderBy: { id: "asc" },
  });
  console.log(`photoUrl を持つ候補者: ${all.length} 件\n`);

  let alreadyOk = 0;
  let fixed = 0;
  let failed = 0;
  const failures: { id: number; name: string; url: string }[] = [];

  for (const p of all) {
    const current = p.photoUrl!;
    if (current.includes("drive.google.com/thumbnail?")) {
      alreadyOk++;
      continue;
    }
    const converted = toDriveThumbUrl(current);
    if (!converted) {
      failed++;
      failures.push({ id: p.id, name: p.name, url: current });
      continue;
    }
    if (DRY_RUN) {
      console.log(`  [DRY] ID=${p.id} ${p.name}`);
      console.log(`    旧: ${current}`);
      console.log(`    新: ${converted}`);
    } else {
      await prisma.person.update({ where: { id: p.id }, data: { photoUrl: converted } });
      console.log(`  ✅ ID=${p.id} ${p.name}`);
    }
    fixed++;
  }

  console.log("\n============================================");
  console.log("📊 サマリー");
  console.log("============================================");
  console.log(`✅ 既にサムネ形式: ${alreadyOk} 件 (無変更)`);
  console.log(`🔄 変換${DRY_RUN ? "予定" : "完了"}: ${fixed} 件`);
  console.log(`❌ 変換不能 (file ID 取れず): ${failed} 件`);
  if (failures.length > 0) {
    console.log("   ↓ 手動対応必要:");
    for (const f of failures) {
      console.log(`     - ID=${f.id} ${f.name}: ${f.url}`);
    }
  }
  console.log("\n" + (DRY_RUN ? "🔍 DRY RUN" : "✅ 完了"));

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
