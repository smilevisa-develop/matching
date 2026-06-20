/**
 * ResumeProfile.resumeFileUrl が未設定の候補者について、Drive 上の
 * 候補者フォルダを探して「履歴書」と名前に含むファイルの URL を保存する。
 *
 * 対象: driveFolderUrl が設定済みで、resumeFileUrl が空の候補者
 * 検索条件: フォルダ内のファイルで name が "*履歴書*" を含むもの (大小区別なし)
 *
 * DRY_RUN=1 でプレビュー、本実行で更新。
 */

import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getDatabaseUrl } from "../lib/database-url";
import { google } from "googleapis";
import { parseGoogleDriveFolderId } from "../lib/google-docs";

const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";

const cs = getDatabaseUrl();
if (!cs) throw new Error("DATABASE_URL is not set");
const adapter = new PrismaPg({ connectionString: cs });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("============================================");
  console.log("ResumeProfile.resumeFileUrl backfill");
  console.log(`DRY_RUN: ${DRY_RUN ? "✅" : "❌ (本実行)"}`);
  console.log("============================================\n");

  // 対象: resumeFileUrl 空 かつ driveFolderUrl 有り
  const candidates = await prisma.person.findMany({
    where: {
      driveFolderUrl: { not: null },
      resumeProfile: {
        resumeFileUrl: null,
      },
    },
    select: {
      id: true,
      name: true,
      driveFolderUrl: true,
      resumeProfile: { select: { id: true, resumeFileUrl: true } },
    },
    orderBy: { id: "asc" },
  });
  console.log(`対象候補者: ${candidates.length} 件`);
  if (candidates.length === 0) {
    await prisma.$disconnect();
    return;
  }

  // Drive 認証
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!,
    key: (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
  await auth.authorize();
  const drive = google.drive({ version: "v3", auth });

  let found = 0;
  let notFound = 0;
  let errored = 0;

  for (const p of candidates) {
    const folderId = parseGoogleDriveFolderId(p.driveFolderUrl ?? "");
    if (!folderId) {
      console.log(`  ⏭  ID=${p.id} ${p.name}: フォルダ ID 解決不能`);
      errored++;
      continue;
    }

    try {
      // フォルダ内のファイルを listing (名前に "履歴書" 含む)
      const list = await drive.files.list({
        q: `'${folderId}' in parents and name contains '履歴書' and trashed = false and mimeType != 'application/vnd.google-apps.folder'`,
        fields: "files(id,name,webViewLink,createdTime)",
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        orderBy: "createdTime desc",
        pageSize: 5,
      });
      const file = list.data.files?.[0];
      if (!file?.id) {
        console.log(`  🔍 ID=${p.id} ${p.name}: 履歴書ファイル見つからず`);
        notFound++;
        continue;
      }
      const url = file.webViewLink ?? `https://drive.google.com/file/d/${file.id}/view`;
      if (DRY_RUN) {
        console.log(`  [DRY] ID=${p.id} ${p.name} ← ${file.name} (${url})`);
      } else {
        if (p.resumeProfile) {
          await prisma.resumeProfile.update({
            where: { id: p.resumeProfile.id },
            data: { resumeFileUrl: url },
          });
        } else {
          // resumeProfile が無い場合は作成
          await prisma.resumeProfile.create({
            data: { personId: p.id, resumeFileUrl: url },
          });
        }
        console.log(`  ✅ ID=${p.id} ${p.name} ← ${file.name}`);
      }
      found++;
    } catch (e) {
      console.log(`  ❌ ID=${p.id} ${p.name}: ${e instanceof Error ? e.message : "error"}`);
      errored++;
    }
  }

  console.log("\n============================================");
  console.log(`📊 サマリー`);
  console.log("============================================");
  console.log(`  ✅ 見つかった/${DRY_RUN ? "予定" : "更新"}: ${found}`);
  console.log(`  🔍 履歴書ファイル無し: ${notFound}`);
  console.log(`  ❌ エラー: ${errored}`);
  console.log("\n" + (DRY_RUN ? "🔍 DRY RUN" : "✅ 完了"));

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
