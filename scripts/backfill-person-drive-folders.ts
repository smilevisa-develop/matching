/**
 * driveFolderUrl が null な候補者を全部ループし、
 * ensurePersonDriveFolder で Drive フォルダを紐づけ or 作成する。
 *
 * ロジックは POST /api/personnel と同じ:
 *   ① 既存の "{ID 4 桁}_" で始まるフォルダがあれば → その URL を紐づけ
 *   ② なければ → "{ID 4 桁}_{英語名 or 名前}" で新規作成
 *
 * DRY_RUN=1 でプレビューだけ (Drive への書き込み一切なし)、
 * 本実行では実際に紐づけ or 作成する。
 */

import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getDatabaseUrl } from "../lib/database-url";
import { buildPersonFolderName, ensurePersonDriveFolder } from "../lib/google-docs";

const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";

const cs = getDatabaseUrl();
if (!cs) throw new Error("DATABASE_URL is not set");
const adapter = new PrismaPg({ connectionString: cs });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("============================================");
  console.log("候補者 driveFolderUrl バックフィル");
  console.log(`DRY_RUN: ${DRY_RUN ? "✅ (Drive 触らない)" : "❌ (本実行)"}`);
  console.log("============================================\n");

  const persons = await prisma.person.findMany({
    where: { OR: [{ driveFolderUrl: null }, { driveFolderUrl: "" }] },
    select: {
      id: true,
      name: true,
      onboarding: { select: { englishName: true } },
    },
    orderBy: { id: "asc" },
  });

  console.log(`対象: ${persons.length} 件\n`);

  let linked = 0;
  let created = 0;
  let failed = 0;

  for (const p of persons) {
    const englishName = p.onboarding?.englishName ?? null;
    const folderName = buildPersonFolderName({
      id: p.id,
      englishName,
      name: p.name,
    });

    if (DRY_RUN) {
      console.log(`[DRY] ID=${String(p.id).padStart(4, "0")} ${p.name} → 「${folderName}」を検索 or 作成`);
      continue;
    }

    try {
      const folder = await ensurePersonDriveFolder({
        existingFolderUrl: null,
        personId: p.id,
        personName: folderName,
      });
      if (!folder.folderUrl) {
        console.log(`⚠️ ID=${p.id} ${p.name}: folder.folderUrl が空`);
        failed++;
        continue;
      }
      // 検索でヒットしたか新規作成かはこの API シグネチャからは区別できないので、
      // 単純に「紐づけ or 作成完了」ログにする
      await prisma.person.update({
        where: { id: p.id },
        data: { driveFolderUrl: folder.folderUrl },
      });
      // ensurePersonDriveFolder は既存 URL があれば返すが、null 渡しているのでここには来ない
      // → 検索 hit or 新規作成のいずれか。カウントは合算 (見分けたければ folder.folderId で確認可)
      linked++;
      console.log(`✅ ID=${String(p.id).padStart(4, "0")} ${p.name} → ${folder.folderUrl}`);
    } catch (e) {
      failed++;
      console.log(
        `❌ ID=${p.id} ${p.name}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  console.log("\n============================================");
  console.log("📊 サマリー");
  console.log("============================================");
  console.log(`  対象: ${persons.length}`);
  console.log(`  ✅ 紐づけ or 作成: ${linked}`);
  console.log(`  ❌ 失敗: ${failed}`);
  console.log("\n" + (DRY_RUN ? "🔍 DRY RUN" : "✅ 完了"));

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
