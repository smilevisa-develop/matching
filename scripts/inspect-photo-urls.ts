import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getDatabaseUrl } from "../lib/database-url";

const cs = getDatabaseUrl();
if (!cs) throw new Error("DATABASE_URL is not set");
const adapter = new PrismaPg({ connectionString: cs });
const prisma = new PrismaClient({ adapter });

async function main() {
  const persons = await prisma.person.findMany({
    where: { photoUrl: { not: null } },
    select: { id: true, name: true, photoUrl: true },
    orderBy: { id: "asc" },
  });
  const patterns = new Map<string, { count: number; samples: { id: number; name: string; url: string }[] }>();

  const classify = (url: string): string => {
    if (url.startsWith("data:")) return "data:";
    if (url.includes("drive.google.com/thumbnail")) return "drive.google.com/thumbnail";
    if (url.includes("drive.google.com/file")) return "drive.google.com/file/d/";
    if (url.includes("drive.google.com/open")) return "drive.google.com/open?id=";
    if (url.includes("drive.google.com/uc")) return "drive.google.com/uc?id=";
    if (url.includes("drive.google.com")) return "drive.google.com/(other)";
    if (url.includes("lh3.googleusercontent.com")) return "lh3.googleusercontent.com";
    if (url.includes("googleusercontent.com")) return "googleusercontent.com";
    if (url.startsWith("http")) return "その他 http";
    return "その他";
  };

  for (const p of persons) {
    const key = classify(p.photoUrl ?? "");
    if (!patterns.has(key)) patterns.set(key, { count: 0, samples: [] });
    const entry = patterns.get(key)!;
    entry.count++;
    if (entry.samples.length < 3) {
      entry.samples.push({ id: p.id, name: p.name, url: p.photoUrl!.slice(0, 120) });
    }
  }

  console.log(`合計 photoUrl 設定済: ${persons.length}\n`);
  for (const [key, v] of patterns.entries()) {
    console.log(`■ ${key}: ${v.count} 件`);
    for (const s of v.samples) {
      console.log(`  ID=${s.id} ${s.name}`);
      console.log(`    ${s.url}${s.url.length >= 120 ? "..." : ""}`);
    }
  }
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
