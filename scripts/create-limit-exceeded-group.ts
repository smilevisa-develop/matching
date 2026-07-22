/**
 * 直近の一括送信で LINE 月間上限で送れなかった 30 社を Group として登録。
 * ライトプラン切替後、この Group を選んで一発で再送信できるようにする。
 *
 * DRY_RUN=1 でプレビュー、本実行で作成。
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

type Failure = { name: string; channel: string; error: string };

async function main() {
  console.log("============================================");
  console.log("LINE 月間上限 未送信 30 社 → Group 化");
  console.log(`DRY_RUN: ${DRY_RUN ? "✅" : "❌ (本実行)"}`);
  console.log("============================================\n");

  // 直近 3 件の一括送信ログから、LINE 上限エラーで失敗したパートナー名を全部拾う
  const logs = await prisma.messageLog.findMany({
    where: { status: "done", title: { contains: "一斉配信" } },
    orderBy: { createdAt: "desc" },
    take: 3,
  });
  const limitErrorNames = new Set<string>();
  for (const log of logs) {
    if (!log.failures) continue;
    const failures = log.failures as unknown as Failure[];
    for (const f of failures) {
      if (typeof f !== "object" || !f) continue;
      if (!/LINE/i.test(f.channel ?? "")) continue;
      if (!/monthly limit|reached your/i.test(f.error ?? "")) continue;
      limitErrorNames.add(f.name);
    }
  }
  console.log(`失敗ログから抽出: ${limitErrorNames.size} 社\n`);

  const partners = await prisma.partner.findMany({
    where: { name: { in: Array.from(limitErrorNames) } },
    select: { id: true, name: true },
    orderBy: { id: "asc" },
  });
  console.log(`DB マッチ: ${partners.length} 社`);
  for (const p of partners) console.log(`  ID=${p.id} ${p.name}`);

  const today = new Date().toISOString().slice(0, 10);
  const groupName = `【要再送】LINE 上限 未送信 (${today})`;
  console.log(`\nグループ名: ${groupName}`);

  if (DRY_RUN) {
    console.log("\n🔍 DRY RUN — Group 作成しません");
    await prisma.$disconnect();
    return;
  }

  // 同名の Group が既にあるなら再利用しない、必ず 新規作成 (履歴を残すため)
  const group = await prisma.group.create({
    data: {
      name: groupName,
      members: {
        create: partners.map((p) => ({ partnerId: p.id })),
      },
    },
    include: { members: true },
  });
  console.log(`\n✅ Group 作成: ID=${group.id}, メンバー ${group.members.length} 社`);
  console.log(`   /broadcast で「グループ」モードを選択 → 「${groupName}」を選んで送信`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
