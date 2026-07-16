/**
 * 特定 ID 帯の候補者の photoUrl から fileId を抽出し、
 * Drive API 経由で実際に読めるか確認する。
 */
import "dotenv/config";
import { google } from "googleapis";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getDatabaseUrl } from "../lib/database-url";
import { extractDriveFileId } from "../lib/drive-url";

const cs = getDatabaseUrl();
if (!cs) throw new Error("DATABASE_URL is not set");
const adapter = new PrismaPg({ connectionString: cs });
const prisma = new PrismaClient({ adapter });

async function driveClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.trim();
  if (!email || !key) throw new Error("Google SA 未設定");
  const auth = new google.auth.JWT({
    email,
    key: key.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
  await auth.authorize();
  return google.drive({ version: "v3", auth });
}

async function main() {
  const ids = [1, 50, 100, 109, 110, 111, 115, 120, 150, 200, 250];
  const persons = await prisma.person.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, photoUrl: true },
    orderBy: { id: "asc" },
  });
  const drive = await driveClient();
  for (const p of persons) {
    const fileId = extractDriveFileId(p.photoUrl);
    process.stdout.write(`ID=${p.id} ${p.name} fileId=${fileId} `);
    if (!fileId) {
      console.log("→ fileId 抽出不可");
      continue;
    }
    try {
      const meta = await drive.files.get({
        fileId,
        fields: "id,name,mimeType,trashed",
        supportsAllDrives: true,
      });
      console.log(`→ OK name=${meta.data.name} mime=${meta.data.mimeType} trashed=${meta.data.trashed}`);
    } catch (e) {
      console.log(`→ NG ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
