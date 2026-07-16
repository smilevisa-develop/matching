/**
 * 各候補者の photoUrl から fileId を抜き出し、Service Account が Drive にアクセスできるか
 * 一括で判定する診断用エンドポイント。
 *
 * GET /api/admin/inspect-photo-access                    ← 全候補者
 * GET /api/admin/inspect-photo-access?ids=1,50,100,120   ← 特定 ID のみ
 * GET /api/admin/inspect-photo-access?onlyErrors=1       ← 失敗のみ返す
 */
import { google } from "googleapis";
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
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
  await auth.authorize();
  return google.drive({ version: "v3", auth });
}

export async function GET(req: Request) {
  try {
    await requireApiAccount();
    const { searchParams } = new URL(req.url);
    const onlyErrors = searchParams.get("onlyErrors") === "1";
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
      select: { id: true, name: true, photoUrl: true },
      orderBy: { id: "asc" },
    });

    const drive = await driveClient();

    const results: {
      id: number;
      name: string;
      fileId: string | null;
      ok: boolean;
      driveName?: string;
      mimeType?: string;
      trashed?: boolean;
      error?: string;
    }[] = [];

    for (const p of persons) {
      const fileId = extractDriveFileId(p.photoUrl);
      if (!fileId) {
        results.push({ id: p.id, name: p.name, fileId: null, ok: false, error: "fileId 抽出不可" });
        continue;
      }
      try {
        const meta = await drive.files.get({
          fileId,
          fields: "id,name,mimeType,trashed",
          supportsAllDrives: true,
        });
        results.push({
          id: p.id,
          name: p.name,
          fileId,
          ok: !meta.data.trashed,
          driveName: meta.data.name ?? undefined,
          mimeType: meta.data.mimeType ?? undefined,
          trashed: meta.data.trashed ?? false,
        });
      } catch (e) {
        results.push({
          id: p.id,
          name: p.name,
          fileId,
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    const filtered = onlyErrors ? results.filter((r) => !r.ok) : results;
    const totals = {
      total: results.length,
      ok: results.filter((r) => r.ok).length,
      ng: results.filter((r) => !r.ok).length,
      trashed: results.filter((r) => r.trashed).length,
    };
    return Response.json({ ok: true, totals, results: filtered });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 },
    );
  }
}
