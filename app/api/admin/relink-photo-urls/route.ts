/**
 * photoUrl の fileId が壊れている候補者について、Drive の候補者フォルダを走査し
 * 画像ファイル (顔写真) を探して photoUrl を貼り直す。
 *
 * ロジック:
 *   1. photoUrl が設定済みで、Drive fileId が読めない候補者を抽出
 *   2. person.driveFolderUrl から候補者フォルダ ID を取り、その配下を list
 *   3. mimeType が image/* のファイルを "顔写真" 含みを優先で探す
 *   4. 見つかったら thumbnail URL を作って person.photoUrl を更新
 *
 * GET /api/admin/relink-photo-urls              ← ドライラン
 * GET /api/admin/relink-photo-urls?apply=1      ← 本実行
 * GET /api/admin/relink-photo-urls?ids=1,2,3    ← 特定 ID のみ
 */
import { google, type drive_v3 } from "googleapis";
import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";
import { extractDriveFileId } from "@/lib/drive-url";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

async function driveClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.trim();
  if (!email || !key) throw new Error("Google SA 未設定");
  const auth = new google.auth.JWT({
    email,
    key: key.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
  await auth.authorize();
  return google.drive({ version: "v3", auth });
}

/**
 * フォルダ内から「顔写真」らしき画像を 1 つ探す。
 * 顔写真 > photo > face のキーワードにマッチするものだけ返す。
 * 免許証/在留カード/証明書 等を誤ってヒットさせないため、
 * キーワードなしの画像へのフォールバックはしない。
 */
async function findPhotoInFolder(
  drive: drive_v3.Drive,
  folderId: string,
): Promise<{ fileId: string; name: string; thumb: string } | null> {
  const res = await drive.files.list({
    q: `'${folderId}' in parents and mimeType contains 'image/' and trashed = false`,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    fields: "files(id,name,mimeType,thumbnailLink,webViewLink)",
    pageSize: 50,
  });
  const files = res.data.files ?? [];
  if (files.length === 0) return null;
  const byKeyword = (kw: string) =>
    files.find((f) => (f.name ?? "").toLowerCase().includes(kw.toLowerCase()));
  const chosen = byKeyword("顔写真") || byKeyword("photo") || byKeyword("face");
  if (!chosen?.id) return null;
  return {
    fileId: chosen.id,
    name: chosen.name ?? "(no name)",
    thumb: `https://drive.google.com/thumbnail?id=${chosen.id}&sz=w400`,
  };
}

export async function GET(req: Request) {
  try {
    await requireApiAccount();
    const { searchParams } = new URL(req.url);
    const apply = searchParams.get("apply") === "1";
    const idsParam = searchParams.get("ids");
    const idFilter = idsParam
      ? idsParam
          .split(",")
          .map((s) => Number(s.trim()))
          .filter((n) => Number.isFinite(n) && n > 0)
      : null;

    const where: Record<string, unknown> = { photoUrl: { not: null } };
    if (idFilter) where.id = { in: idFilter };

    const persons = await prisma.person.findMany({
      where,
      select: { id: true, name: true, photoUrl: true, driveFolderUrl: true },
      orderBy: { id: "asc" },
    });

    const drive = await driveClient();
    const results: {
      id: number;
      name: string;
      status: "relinked" | "still_ok" | "no_folder" | "no_photo_in_folder" | "no_current_fileid";
      oldPhotoUrl?: string | null;
      newPhotoUrl?: string;
      foundFileName?: string;
    }[] = [];

    for (const p of persons) {
      // 現在の photoUrl の fileId が読めるならスキップ
      const currentFileId = extractDriveFileId(p.photoUrl);
      if (currentFileId) {
        try {
          const meta = await drive.files.get({
            fileId: currentFileId,
            fields: "id,trashed",
            supportsAllDrives: true,
          });
          if (!meta.data.trashed) {
            results.push({ id: p.id, name: p.name, status: "still_ok" });
            continue;
          }
        } catch {
          // 読めない → 探し直しへ
        }
      }

      // 候補者フォルダを見に行く
      const folderId = extractDriveFileId(p.driveFolderUrl);
      if (!folderId) {
        results.push({
          id: p.id,
          name: p.name,
          status: "no_folder",
          oldPhotoUrl: p.photoUrl,
        });
        continue;
      }
      const found = await findPhotoInFolder(drive, folderId);
      if (!found) {
        results.push({
          id: p.id,
          name: p.name,
          status: "no_photo_in_folder",
          oldPhotoUrl: p.photoUrl,
        });
        continue;
      }
      if (apply) {
        await prisma.person.update({
          where: { id: p.id },
          data: { photoUrl: found.thumb },
        });
      }
      results.push({
        id: p.id,
        name: p.name,
        status: "relinked",
        oldPhotoUrl: p.photoUrl,
        newPhotoUrl: found.thumb,
        foundFileName: found.name,
      });
    }

    const totals = {
      total: results.length,
      relinked: results.filter((r) => r.status === "relinked").length,
      still_ok: results.filter((r) => r.status === "still_ok").length,
      no_folder: results.filter((r) => r.status === "no_folder").length,
      no_photo_in_folder: results.filter((r) => r.status === "no_photo_in_folder").length,
    };
    return Response.json({ ok: true, apply, totals, results });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 },
    );
  }
}

