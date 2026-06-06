/**
 * email 欄に @ を含む値が入っているパートナーを一覧表示。
 * 主な連絡手段 (channel) も併記して、すでにメール配信対象になっているか確認できる。
 *
 *   npx tsx scripts/list-partners-with-valid-email.ts
 */
import { prisma } from "../lib/prisma";

async function main() {
  const partners = await prisma.partner.findMany({
    where: { email: { not: null } },
    select: {
      id: true,
      name: true,
      country: true,
      email: true,
      channel: true,
    },
    orderBy: { id: "asc" },
  });

  // email が @ を含むものだけ抽出
  const validEmail = partners.filter((p) => p.email && /@/.test(p.email));
  const invalidEmail = partners.filter((p) => p.email && !/@/.test(p.email));

  console.log(`📊 全パートナー中、email 欄に何か入っている: ${partners.length} 社`);
  console.log(`   ✅ @ を含む有効形式: ${validEmail.length} 社`);
  console.log(`   ❌ @ を含まない (Line/番号なし 等のテキスト): ${invalidEmail.length} 社`);
  console.log("");

  if (validEmail.length > 0) {
    console.log("【有効なメールアドレス入力済みパートナー一覧】");
    console.log("ID\t主な連絡手段\t国\tパートナー名\tメール");
    console.log("─".repeat(120));
    for (const p of validEmail) {
      const chMark = p.channel === "mail" || p.channel === "メール" || p.channel === "Email" ? "✅" : "⚠️";
      console.log(
        `#${p.id}\t${chMark}${(p.channel ?? "未設定").padEnd(6)}\t${(p.country ?? "-").padEnd(8)}\t${p.name.padEnd(28)}\t${p.email}`
      );
    }
    console.log("");
    const readyForMail = validEmail.filter(
      (p) => p.channel === "mail" || p.channel === "メール" || p.channel === "Email"
    );
    console.log(`📧 うち、すでに主な連絡手段=メール のパートナー: ${readyForMail.length} 社`);
    if (readyForMail.length !== validEmail.length) {
      console.log(
        `   ${validEmail.length - readyForMail.length} 社は主な連絡手段が別の値なので、現状メール配信対象外`
      );
    }
  }

  if (invalidEmail.length > 0) {
    console.log("");
    console.log("【参考: email 欄に @ 無しの値が入っているパートナー (配信対象外)】");
    for (const p of invalidEmail.slice(0, 20)) {
      console.log(`  #${p.id}\t${p.name.padEnd(28)}\t"${p.email}"`);
    }
    if (invalidEmail.length > 20) {
      console.log(`  ... 他 ${invalidEmail.length - 20} 件`);
    }
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
