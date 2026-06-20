import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getDatabaseUrl } from "../lib/database-url";

const cs = getDatabaseUrl();
if (!cs) throw new Error("DATABASE_URL is not set");
const adapter = new PrismaPg({ connectionString: cs });
const prisma = new PrismaClient({ adapter });

async function main() {
  // 推薦リスト出力で問題があったと思われる ID 197, 198, 204, 224, 225 を確認
  const ids = [197, 198, 204, 224, 225];
  const people = await prisma.person.findMany({
    where: { id: { in: ids } },
    include: {
      onboarding: true,
      resumeProfile: { select: { visaExpiryDate: true, japaneseLevelDate: true } },
    },
  });
  for (const p of people) {
    console.log(`\nID=${p.id} ${p.name}`);
    console.log("  onb.birthDate:    ", JSON.stringify(p.onboarding?.birthDate));
    console.log("  onb.address:      ", JSON.stringify(p.onboarding?.address));
    console.log("  resume.visaExpiry:", JSON.stringify(p.resumeProfile?.visaExpiryDate));
    console.log("  resume.jlDate:    ", JSON.stringify(p.resumeProfile?.japaneseLevelDate));
  }
  await prisma.$disconnect();
}

main().catch(console.error);
