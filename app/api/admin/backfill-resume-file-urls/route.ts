/**
 * 既存候補者の ResumeProfile.resumeFileUrl を Drive 上の履歴書ファイルから
 * 一括埋める admin 用エンドポイント。Railway 上で 1 回呼ぶ想定。
 *
 * GET /api/admin/backfill-resume-file-urls?apply=1  ← 実行
 * GET /api/admin/backfill-resume-file-urls          ← DRY RUN
 *
 * 対象: driveFolderUrl 有り + resumeFileUrl 空 の候補者
 * 検索: フォルダ内の name に "履歴書" を含むファイル (最新)
 */

import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";
import { parseGoogleDriveFolderId } from "@/lib/google-docs";
import { google } from "googleapis";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: Request) {
  try {
    await requireApiAccount();
    const { searchParams } = new URL(req.url);
    const apply = searchParams.get("apply") === "1";

    const candidates = await prisma.person.findMany({
      where: {
        driveFolderUrl: { not: null },
        resumeProfile: { resumeFileUrl: null },
      },
      select: {
        id: true,
        name: true,
        driveFolderUrl: true,
        resumeProfile: { select: { id: true } },
      },
      orderBy: { id: "asc" },
    });

    const auth = new google.auth.JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!,
      key: (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
      scopes: ["https://www.googleapis.com/auth/drive"],
    });
    await auth.authorize();
    const drive = google.drive({ version: "v3", auth });

    const log: string[] = [];
    let found = 0;
    let notFound = 0;
    let errored = 0;

    for (const p of candidates) {
      const folderId = parseGoogleDriveFolderId(p.driveFolderUrl ?? "");
      if (!folderId) {
        log.push(`⏭  ID=${p.id} ${p.name}: フォルダ ID 解決不能`);
        errored++;
        continue;
      }
      try {
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
          log.push(`🔍 ID=${p.id} ${p.name}: 履歴書ファイル見つからず`);
          notFound++;
          continue;
        }
        const url = file.webViewLink ?? `https://drive.google.com/file/d/${file.id}/view`;
        if (apply) {
          if (p.resumeProfile) {
            await prisma.resumeProfile.update({
              where: { id: p.resumeProfile.id },
              data: { resumeFileUrl: url },
            });
          } else {
            await prisma.resumeProfile.create({
              data: { personId: p.id, resumeFileUrl: url },
            });
          }
          log.push(`✅ ID=${p.id} ${p.name} ← ${file.name}`);
        } else {
          log.push(`[DRY] ID=${p.id} ${p.name} ← ${file.name}`);
        }
        found++;
      } catch (e) {
        log.push(`❌ ID=${p.id} ${p.name}: ${e instanceof Error ? e.message : "error"}`);
        errored++;
      }
    }

    return Response.json({
      ok: true,
      apply,
      totals: { candidates: candidates.length, found, notFound, errored },
      log,
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 }
    );
  }
}
