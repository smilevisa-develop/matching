/**
 * CoreSettings.recommendationColumns から "preferenceNote" (本人希望) と
 * "sswYears" (特定技能経過年数) を取り除く。
 * 過去にユーザーが保存した設定を矯正するための一回限りスクリプト。
 */

import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getDatabaseUrl } from "../lib/database-url";

const REMOVE = new Set(["preferenceNote", "sswYears"]);
const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";

const cs = getDatabaseUrl();
if (!cs) throw new Error("DATABASE_URL is not set");
const adapter = new PrismaPg({ connectionString: cs });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("============================================");
  console.log("CoreSettings.recommendationColumns 矯正");
  console.log(`DRY_RUN: ${DRY_RUN ? "✅" : "❌ (本実行)"}`);
  console.log("============================================\n");

  const all = await prisma.coreSettings.findMany();
  for (const cs of all) {
    const cols = Array.isArray(cs.recommendationColumns) ? (cs.recommendationColumns as unknown[]) : null;
    if (!cols) {
      console.log(`id=${cs.id}: recommendationColumns 未設定 → スキップ`);
      continue;
    }
    const filtered = cols.filter((c) => typeof c === "string" && !REMOVE.has(c)) as string[];
    const removed = cols.filter((c) => typeof c === "string" && REMOVE.has(c)) as string[];
    if (removed.length === 0) {
      console.log(`id=${cs.id}: 削除対象なし (${cols.length} 件のまま)`);
      continue;
    }
    console.log(`id=${cs.id}: ${cols.length} → ${filtered.length} 件 (削除: ${removed.join(", ")})`);
    if (!DRY_RUN) {
      await prisma.coreSettings.update({
        where: { id: cs.id },
        data: { recommendationColumns: filtered },
      });
    }
  }
  console.log("\n" + (DRY_RUN ? "🔍 DRY RUN" : "✅ 完了"));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
