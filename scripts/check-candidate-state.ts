import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getDatabaseUrl } from "../lib/database-url";

const cs = getDatabaseUrl();
if (!cs) throw new Error("DATABASE_URL is not set");
const adapter = new PrismaPg({ connectionString: cs });
const prisma = new PrismaClient({ adapter });

async function main() {
  const count = await prisma.person.count();
  const max = await prisma.person.findFirst({
    orderBy: { id: "desc" },
    select: { id: true, name: true, createdAt: true },
  });
  const withPhoto = await prisma.person.count({ where: { photoUrl: { not: null } } });
  const recent = await prisma.person.findMany({
    orderBy: { id: "desc" },
    take: 5,
    select: { id: true, name: true, photoUrl: true, createdAt: true },
  });
  console.log("現在のPerson数:", count);
  console.log("最大 ID:", max?.id, "(" + max?.name + ", 作成:", max?.createdAt?.toISOString().slice(0, 10) + ")");
  console.log("顔写真あり:", withPhoto);
  console.log("--- 最新 5 件 ---");
  for (const p of recent) {
    console.log(`  ID=${p.id} ${p.name} 写真=${p.photoUrl ? "あり" : "無し"} 作成=${p.createdAt.toISOString().slice(0, 10)}`);
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
