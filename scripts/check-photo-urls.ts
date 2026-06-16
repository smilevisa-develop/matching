import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getDatabaseUrl } from "../lib/database-url";

const cs = getDatabaseUrl();
if (!cs) throw new Error("DATABASE_URL is not set");
const adapter = new PrismaPg({ connectionString: cs });
const prisma = new PrismaClient({ adapter });

async function main() {
  // 新規取込分の photoUrl をサンプル表示
  const newOnes = await prisma.person.findMany({
    where: { id: { gte: 192 } },
    select: { id: true, name: true, photoUrl: true },
    orderBy: { id: "asc" },
    take: 5,
  });
  console.log("=== 新規取込 (ID 192+) の photoUrl サンプル ===");
  for (const p of newOnes) {
    console.log(`  ID=${p.id} ${p.name}`);
    console.log(`    photoUrl: ${p.photoUrl ?? "(無し)"}`);
  }

  // 既存で表示されてる候補者の photoUrl 形式
  const existingWithPhoto = await prisma.person.findMany({
    where: { id: { lte: 191 }, photoUrl: { not: null } },
    select: { id: true, name: true, photoUrl: true },
    orderBy: { id: "desc" },
    take: 5,
  });
  console.log("\n=== 既存 (ID ≤ 191) で表示されてる photoUrl サンプル ===");
  for (const p of existingWithPhoto) {
    console.log(`  ID=${p.id} ${p.name}`);
    console.log(`    photoUrl: ${p.photoUrl}`);
  }

  // 形式別件数
  const all = await prisma.person.findMany({
    where: { photoUrl: { not: null } },
    select: { id: true, photoUrl: true },
  });
  const counts: Record<string, number> = {};
  for (const p of all) {
    const u = p.photoUrl!;
    let kind = "other";
    if (u.includes("drive.google.com/file/d/")) kind = "drive_file_share (要変換)";
    else if (u.includes("drive.google.com/uc?")) kind = "drive_uc (旧変換済)";
    else if (u.includes("drive.google.com/thumbnail")) kind = "drive_thumbnail (変換済)";
    else if (u.includes("googleusercontent.com")) kind = "googleusercontent (変換済)";
    else if (u.startsWith("data:")) kind = "data_uri";
    else kind = "other: " + u.slice(0, 50);
    counts[kind] = (counts[kind] ?? 0) + 1;
  }
  console.log("\n=== photoUrl 形式別件数 (全体) ===");
  for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${v} 件 — ${k}`);
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
