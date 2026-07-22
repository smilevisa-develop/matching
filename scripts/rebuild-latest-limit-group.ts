/**
 * 最新 1 回の一括送信ログのみを見て、LINE 上限で送れなかったパートナーを
 * Group として再作成する。過去分は取らない = 二重送信リスク回避。
 *
 * 事前に古い Group ID=1 は削除する。
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
  console.log("最新 1 回のみで再構築 (二重送信回避)");
  console.log(`DRY_RUN: ${DRY_RUN ? "✅" : "❌ (本実行)"}`);
  console.log("============================================\n");

  // 最新の一括送信ログ 1 件だけ
  const log = await prisma.messageLog.findFirst({
    where: { status: "done", title: { contains: "一斉配信" } },
    orderBy: { createdAt: "desc" },
  });
  if (!log) {
    console.log("送信ログがありません");
    await prisma.$disconnect();
    return;
  }

  console.log(`最新ログ: ${log.createdAt.toISOString().slice(0, 19)}`);
  console.log(`  対象: ${log.matchedCount} 件 / 成功: ${log.sentCount} / 失敗: ${log.failedCount}\n`);

  const limitErrorNames = new Set<string>();
  const failures = (log.failures ?? []) as unknown as Failure[];
  for (const f of failures) {
    if (typeof f !== "object" || !f) continue;
    if (!/LINE/i.test(f.channel ?? "")) continue;
    if (!/monthly limit|reached your/i.test(f.error ?? "")) continue;
    limitErrorNames.add(f.name);
  }

  console.log(`LINE 上限エラー: ${limitErrorNames.size} 社`);

  const partners = await prisma.partner.findMany({
    where: { name: { in: Array.from(limitErrorNames) } },
    select: { id: true, name: true },
    orderBy: { id: "asc" },
  });
  for (const p of partners) console.log(`  ID=${p.id} ${p.name}`);

  // 差分チェック
  const matchedNames = new Set(partners.map((p) => p.name));
  const notMatched = Array.from(limitErrorNames).filter((n) => !matchedNames.has(n));
  if (notMatched.length > 0) {
    console.log(`\n⚠️ DB マッチしなかった名前: ${notMatched.length} 件`);
    for (const n of notMatched) console.log(`  - ${n}`);
  }

  const today = new Date().toISOString().slice(0, 10);
  const groupName = `【要再送】LINE 上限 未送信 (${today})`;
  console.log(`\nグループ名: ${groupName}`);

  if (DRY_RUN) {
    console.log("\n🔍 DRY RUN — 変更しません");
    await prisma.$disconnect();
    return;
  }

  // 既存の同名 Group を全部削除 (二重グループ回避)
  const existing = await prisma.group.findMany({
    where: { name: { contains: "LINE 上限 未送信" } },
  });
  for (const g of existing) {
    await prisma.group.delete({ where: { id: g.id } });
    console.log(`  🗑 旧 Group id=${g.id} (${g.name}) を削除`);
  }

  // 新規作成
  const group = await prisma.group.create({
    data: {
      name: groupName,
      members: {
        create: partners.map((p) => ({ partnerId: p.id })),
      },
    },
    include: { members: true },
  });
  console.log(`\n✅ 新規 Group 作成: ID=${group.id}, メンバー ${group.members.length} 社`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
