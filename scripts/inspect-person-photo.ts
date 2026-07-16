import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getDatabaseUrl } from "../lib/database-url";

const cs = getDatabaseUrl();
if (!cs) throw new Error("DATABASE_URL is not set");
const adapter = new PrismaPg({ connectionString: cs });
const prisma = new PrismaClient({ adapter });

async function main() {
  const idArg = process.argv[2] ? Number(process.argv[2]) : 1;
  const p = await prisma.person.findUnique({
    where: { id: idArg },
    select: { id: true, name: true, photoUrl: true, driveFolderUrl: true },
  });
  if (!p) {
    console.log(`ID=${idArg} が見つかりません`);
  } else {
    console.log(JSON.stringify(p, null, 2));
    if (p.photoUrl) {
      console.log(`\nhttps? かどうか: ${/^https?:\/\//.test(p.photoUrl) ? "✅" : "❌"}`);
      console.log(`長さ: ${p.photoUrl.length} 文字`);
      console.log(`先頭 200 文字:\n  ${p.photoUrl.slice(0, 200)}`);
    } else {
      console.log("\n⚠️ photoUrl が null");
    }
  }
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
