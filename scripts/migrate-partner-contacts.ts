/**
 * 既存パートナーの contactName / email を PartnerContact (主担当) に移行する。
 *
 * 動作:
 *   1. Partner ごとに、PartnerContact がまだ無い場合 → contactName/email から作成 (isPrimary=true)
 *   2. PartnerContact が既にあり、isPrimary が誰もいない場合 → 先頭を isPrimary=true に
 *   3. PartnerContact が複数 isPrimary を持つ場合 → 先頭のみ true、他は false
 *
 * 使い方:
 *   npx tsx scripts/migrate-partner-contacts.ts            # 確認のみ
 *   npx tsx scripts/migrate-partner-contacts.ts --apply    # 実際に更新
 */
import { prisma } from "../lib/prisma";

async function main() {
  const apply = process.argv.includes("--apply");

  const partners = await prisma.partner.findMany({
    include: {
      contacts: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
    },
    orderBy: { id: "asc" },
  });

  let createdCount = 0;
  let setPrimaryCount = 0;
  let normalizedPrimaryCount = 0;
  const previewLines: string[] = [];

  for (const p of partners) {
    if (p.contacts.length === 0) {
      // ケース 1: contact が無い & legacy 値がある → 新規作成
      const legacyName = (p.contactName ?? "").trim();
      const legacyEmail = (p.email ?? "").trim();
      if (legacyName || legacyEmail) {
        previewLines.push(
          `  CREATE  Partner #${p.id} ${p.name}: name="${legacyName || "(担当者)"}" email="${legacyEmail}"`
        );
        createdCount++;
        if (apply) {
          await prisma.partnerContact.create({
            data: {
              partnerId: p.id,
              name: legacyName || "(担当者)",
              email: legacyEmail || null,
              isPrimary: true,
              sortOrder: 0,
            },
          });
        }
      }
      continue;
    }

    // ケース 2/3: contact が既存
    const primaries = p.contacts.filter((c) => c.isPrimary);
    if (primaries.length === 0) {
      // 先頭を主担当に
      const first = p.contacts[0];
      previewLines.push(
        `  SET-PRIMARY  Partner #${p.id} ${p.name}: PartnerContact #${first.id} (${first.name})`
      );
      setPrimaryCount++;
      if (apply) {
        await prisma.partnerContact.update({
          where: { id: first.id },
          data: { isPrimary: true },
        });
      }
    } else if (primaries.length > 1) {
      // 重複 isPrimary を解消、先頭のみ true
      previewLines.push(
        `  NORMALIZE  Partner #${p.id} ${p.name}: ${primaries.length} 名が isPrimary、先頭のみに正規化`
      );
      normalizedPrimaryCount++;
      if (apply) {
        await prisma.partnerContact.updateMany({
          where: { partnerId: p.id, NOT: { id: primaries[0].id } },
          data: { isPrimary: false },
        });
      }
    }
  }

  console.log("📊 移行プレビュー");
  console.log(`   全パートナー: ${partners.length} 社`);
  console.log(`   - 新規 PartnerContact 作成: ${createdCount} 件`);
  console.log(`   - 既存 contact を主担当に設定: ${setPrimaryCount} 件`);
  console.log(`   - 重複 isPrimary 正規化: ${normalizedPrimaryCount} 件`);
  console.log("");

  if (previewLines.length > 0 && previewLines.length <= 80) {
    console.log("【詳細】");
    previewLines.forEach((l) => console.log(l));
  } else if (previewLines.length > 80) {
    console.log("【詳細 (先頭 30 件)】");
    previewLines.slice(0, 30).forEach((l) => console.log(l));
    console.log(`  ... 他 ${previewLines.length - 30} 件`);
  }

  if (!apply) {
    console.log("");
    console.log("💡 これは dry-run です。実際に更新するには --apply を付けて再実行:");
    console.log("   npx tsx scripts/migrate-partner-contacts.ts --apply");
  } else {
    console.log("");
    console.log("✅ 移行完了。");
  }
}

main()
  .catch((e) => {
    console.error("❌ エラー:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
