/**
 * 直近の一括送信で LINE エラーで届かなかったパートナーを集計。
 * 「LINE 上限超過」など特定エラーだけをフィルタし、パートナー名リストを出す。
 */

import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getDatabaseUrl } from "../lib/database-url";

const cs = getDatabaseUrl();
if (!cs) throw new Error("DATABASE_URL is not set");
const adapter = new PrismaPg({ connectionString: cs });
const prisma = new PrismaClient({ adapter });

type Failure = { name: string; channel: string; error: string };

async function main() {
  // 直近 3 件の一括送信ログを取得 (LINE / Messenger / WhatsApp / メール 全部含む)
  const logs = await prisma.messageLog.findMany({
    where: { status: "done", title: { contains: "一斉配信" } },
    orderBy: { createdAt: "desc" },
    take: 3,
  });

  console.log(`直近の一括送信ログ: ${logs.length} 件\n`);

  const lineFailuresPartnerNames = new Set<string>();
  const lineErrorReasons = new Map<string, number>();

  for (const log of logs) {
    console.log(`── ${log.createdAt.toISOString().slice(0, 19)} ─`);
    console.log(`  対象: ${log.matchedCount} 件 / 送信成功: ${log.sentCount} / 失敗: ${log.failedCount}`);
    if (!log.failures) continue;
    const failures = log.failures as unknown as Failure[];
    for (const f of failures) {
      if (typeof f !== "object" || !f) continue;
      // LINE 関連チャネルだけ
      if (!/LINE/i.test(f.channel ?? "")) continue;
      lineFailuresPartnerNames.add(f.name);
      const reason = (f.error ?? "").slice(0, 100);
      lineErrorReasons.set(reason, (lineErrorReasons.get(reason) ?? 0) + 1);
    }
  }

  console.log(`\n=== LINE で届かなかった一意パートナー: ${lineFailuresPartnerNames.size} 社 ===\n`);
  const names = Array.from(lineFailuresPartnerNames).sort();
  for (const n of names) console.log(`  - ${n}`);

  console.log(`\n=== 失敗理由 (件数) ===`);
  for (const [reason, cnt] of Array.from(lineErrorReasons.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cnt} 件 — ${reason}`);
  }

  // 該当パートナーを DB から検索 (名前一致)
  console.log(`\n=== 対応 Partner ID 検索 ===`);
  const partners = await prisma.partner.findMany({
    where: { name: { in: Array.from(lineFailuresPartnerNames) } },
    select: { id: true, name: true, preferredChannels: true, channel: true, lineUserId: true },
  });
  for (const p of partners) {
    console.log(
      `  ID=${p.id} ${p.name} | preferredChannels=${p.preferredChannels ?? "-"} | channel=${p.channel ?? "-"} | line=${p.lineUserId ? "OK" : "×"}`
    );
  }

  console.log(`\n合計 ${partners.length} / ${names.length} 社を DB でマッチできました`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
