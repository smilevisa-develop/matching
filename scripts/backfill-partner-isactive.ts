/**
 * 既存 Partner の isActive を初期化。
 *
 * ルール:
 *   - 連絡先 ID (lineUserId / lineGroups / messengerPsid / whatsappId) が紐づいている
 *     または email が入力済み → isActive = true
 *   - 他 → isActive = false
 *
 * DRY_RUN=1 でプレビュー、本実行で更新。
 */

import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getDatabaseUrl } from "../lib/database-url";

const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";

const cs = getDatabaseUrl();
if (!cs) throw new Error("DATABASE_URL is not set");
const adapter = new PrismaPg({ connectionString: cs });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("============================================");
  console.log("Partner isActive バックフィル");
  console.log(`DRY_RUN: ${DRY_RUN ? "✅" : "❌ (本実行)"}`);
  console.log("============================================\n");

  const partners = await prisma.partner.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      lineUserId: true,
      messengerPsid: true,
      whatsappId: true,
      isActive: true,
      _count: { select: { lineGroups: true } },
    },
    orderBy: { id: "asc" },
  });

  console.log(`Partner 数: ${partners.length}\n`);

  let toActive = 0;
  let toInactive = 0;
  let noop = 0;

  for (const p of partners) {
    const hasEmail = Boolean(p.email && /@/.test(p.email));
    const hasLinked =
      Boolean(p.lineUserId) ||
      Boolean(p.messengerPsid) ||
      Boolean(p.whatsappId) ||
      p._count.lineGroups > 0;
    const desired = hasEmail || hasLinked;

    if (p.isActive === desired) {
      noop++;
      continue;
    }
    if (desired) toActive++;
    else toInactive++;

    if (DRY_RUN) {
      console.log(
        `[DRY] ID=${p.id} ${p.name}: ${p.isActive} → ${desired}  (email=${hasEmail}, linked=${hasLinked})`,
      );
    } else {
      await prisma.partner.update({
        where: { id: p.id },
        data: { isActive: desired },
      });
      console.log(`✅ ID=${p.id} ${p.name}: ${p.isActive} → ${desired}`);
    }
  }

  console.log("\n============================================");
  console.log("📊 サマリー");
  console.log("============================================");
  console.log(`  → active に変更: ${toActive}`);
  console.log(`  → inactive に変更: ${toInactive}`);
  console.log(`  変更なし: ${noop}`);
  console.log("\n" + (DRY_RUN ? "🔍 DRY RUN" : "✅ 完了"));

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
