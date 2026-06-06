/**
 * LINE グループの在席状態を「読み取り専用 API」で監査する。
 *
 * ⚠️ メッセージは 1 通も送らない (グループメンバーには何も表示されない)
 *
 * 使い方:
 *   npx tsx scripts/audit-line-groups.ts          # 確認のみ (DB 更新せず)
 *   npx tsx scripts/audit-line-groups.ts --apply  # 退会検知したものを isActive=false に更新
 *
 * 仕組み:
 *   isActive=true の全 LineGroup について GET /v2/bot/group/{groupId}/summary を呼ぶ
 *   - 200 OK         → Bot はまだ在席している
 *   - 404 Not Found  → Bot は退会済 (今は在席していない)
 *   - その他のエラー → 一時的な問題、保留 (報告のみ)
 */
import { prisma } from "../lib/prisma";

type CheckResult =
  | { groupId: string; name: string | null; partnerName: string | null; status: "still-in" }
  | { groupId: string; name: string | null; partnerName: string | null; status: "kicked-out" }
  | { groupId: string; name: string | null; partnerName: string | null; status: "error"; detail: string };

async function checkGroup(
  groupId: string,
  token: string
): Promise<{ status: "still-in" | "kicked-out" | "error"; detail?: string }> {
  try {
    const res = await fetch(`https://api.line.me/v2/bot/group/${groupId}/summary`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) return { status: "still-in" };
    if (res.status === 404) return { status: "kicked-out" };
    const body = await res.text().catch(() => "");
    return { status: "error", detail: `HTTP ${res.status}: ${body.slice(0, 100)}` };
  } catch (e) {
    return { status: "error", detail: e instanceof Error ? e.message : "fetch error" };
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    console.error("❌ LINE_CHANNEL_ACCESS_TOKEN が未設定です");
    process.exit(1);
  }

  const groups = await prisma.lineGroup.findMany({
    where: { isActive: true },
    include: { partner: { select: { name: true } } },
    orderBy: { lastSeenAt: "asc" }, // 古い順に確認 (放置中のものを優先)
  });
  console.log(`📊 監査対象: isActive=true の LINE グループ ${groups.length} 件`);
  console.log("");

  const results: CheckResult[] = [];
  for (const g of groups) {
    const r = await checkGroup(g.groupId, token);
    const base = {
      groupId: g.groupId,
      name: g.groupName,
      partnerName: g.partner?.name ?? null,
    };
    if (r.status === "error") {
      results.push({ ...base, status: "error", detail: r.detail ?? "" });
    } else {
      results.push({ ...base, status: r.status });
    }
    // レート制限避けの軽い間隔 (LINE API 60 req/sec なので余裕だが控えめに)
    await new Promise((r) => setTimeout(r, 200));
  }

  const stillIn = results.filter((r) => r.status === "still-in");
  const kicked = results.filter((r) => r.status === "kicked-out");
  const errored = results.filter((r) => r.status === "error");

  console.log("───────────────────────────────────────────");
  console.log(`✅ Bot 在席継続中:   ${stillIn.length} 件`);
  console.log(`🚪 Bot 退会確定:     ${kicked.length} 件`);
  console.log(`⚠️ エラー (保留):     ${errored.length} 件`);
  console.log("───────────────────────────────────────────");

  if (kicked.length > 0) {
    console.log("");
    console.log("【🚪 Bot が退会済みのグループ】");
    for (const k of kicked as Extract<CheckResult, { status: "kicked-out" }>[]) {
      console.log(
        `  ${k.groupId}\t${k.name ?? "(名称不明)"}\tパートナー: ${k.partnerName ?? "未紐づけ"}`
      );
    }
  }

  if (errored.length > 0) {
    console.log("");
    console.log("【⚠️ エラー (一時的な問題かも、後で再確認)】");
    for (const e of errored as Extract<CheckResult, { status: "error" }>[]) {
      console.log(
        `  ${e.groupId}\t${e.name ?? "(名称不明)"}\tエラー: ${e.detail}`
      );
    }
  }

  if (!apply) {
    if (kicked.length > 0) {
      console.log("");
      console.log(`💡 これは確認モードです。退会検知された ${kicked.length} 件を`);
      console.log(`   DB で isActive=false に更新するには --apply を付けて再実行:`);
      console.log(`   npx tsx scripts/audit-line-groups.ts --apply`);
    }
    return;
  }

  if (kicked.length === 0) {
    console.log("");
    console.log("✅ 退会検知ゼロなので DB 更新なし");
    return;
  }

  console.log("");
  console.log(`🚀 ${kicked.length} 件を isActive=false に更新中...`);
  const result = await prisma.lineGroup.updateMany({
    where: {
      groupId: { in: kicked.map((k) => k.groupId) },
    },
    data: { isActive: false },
  });
  console.log(`✅ 更新完了: ${result.count} 件`);
  console.log("");
  console.log("🔁 これらのパートナーへの一斉配信は LINE グループ経由ではなく");
  console.log("   個人 LINE / メール等 (主な連絡手段の選択次第) にフォールバックします。");
  console.log("   再度グループに招待された場合、Webhook 経由で自動的に再登録されます。");
}

main()
  .catch((e) => {
    console.error("❌ エラー:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
