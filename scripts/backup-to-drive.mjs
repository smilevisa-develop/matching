/**
 * データベースのバックアップ (Coolify が毎日 3:00 に作る pg_dump) を Google Drive にコピーする。
 * サーバーが壊れてもデータを戻せるように、サーバーの外にも置く (2026/11 土田さん)。
 *
 * サーバーの cron (/opt/matching-backup/run.sh) から、アプリのコンテナの中で動かす:
 *   node scripts/backup-to-drive.mjs <ダンプのパス> <Drive のフォルダ ID>
 * Drive には新しい順に KEEP 個だけ残し、古いものはゴミ箱に入れる。
 */

import fs from "node:fs";
import path from "node:path";
import { google } from "googleapis";

const KEEP = 30;
const [file, folderId] = process.argv.slice(2);
if (!file || !folderId) {
  console.error("使い方: node scripts/backup-to-drive.mjs <ダンプのパス> <フォルダ ID>");
  process.exit(1);
}

const key = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "").replace(/\\n/g, "\n");
const auth = new google.auth.JWT({
  email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  key,
  scopes: ["https://www.googleapis.com/auth/drive"],
});
const drive = google.drive({ version: "v3", auth });

const name = `matching_${new Date().toISOString().slice(0, 10)}_${path.basename(file)}`;
const res = await drive.files.create({
  requestBody: { name, parents: [folderId], mimeType: "application/octet-stream" },
  media: { mimeType: "application/octet-stream", body: fs.createReadStream(file) },
  fields: "id,name,size",
  supportsAllDrives: true,
});
console.log("保存:", res.data.name, res.data.size);

const list = await drive.files.list({
  q: `'${folderId}' in parents and trashed = false and name contains 'matching_'`,
  orderBy: "createdTime desc",
  fields: "files(id,name)",
  pageSize: 200,
  supportsAllDrives: true,
  includeItemsFromAllDrives: true,
});
for (const f of (list.data.files ?? []).slice(KEEP)) {
  await drive.files.update({ fileId: f.id, requestBody: { trashed: true }, supportsAllDrives: true });
  console.log("古いものをゴミ箱へ:", f.name);
}
