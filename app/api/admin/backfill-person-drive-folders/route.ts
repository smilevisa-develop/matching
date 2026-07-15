/**
 * driveFolderUrl が null な候補者を一括で Drive フォルダに紐づけ or 作成する admin エンドポイント。
 *
 * GET /api/admin/backfill-person-drive-folders           ← ドライラン (対象一覧だけ返す)
 * GET /api/admin/backfill-person-drive-folders?apply=1   ← 本実行
 *
 * ロジックは POST /api/personnel と同じ:
 *   ① Drive 内に "{ID 4 桁}_" で始まる既存フォルダがあれば紐づけ
 *   ② なければ "{ID 4 桁}_{英語名 or 名前}" で新規作成
 */

import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";
import { buildPersonFolderName, ensurePersonDriveFolder } from "@/lib/google-docs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: Request) {
  try {
    await requireApiAccount();
    const { searchParams } = new URL(req.url);
    const apply = searchParams.get("apply") === "1";

    const persons = await prisma.person.findMany({
      where: { OR: [{ driveFolderUrl: null }, { driveFolderUrl: "" }] },
      select: {
        id: true,
        name: true,
        onboarding: { select: { englishName: true } },
      },
      orderBy: { id: "asc" },
    });

    const results: {
      id: number;
      name: string;
      status: "linked" | "created" | "failed" | "planned";
      folderUrl: string | null;
      error: string | null;
    }[] = [];

    if (!apply) {
      for (const p of persons) {
        const folderName = buildPersonFolderName({
          id: p.id,
          englishName: p.onboarding?.englishName ?? null,
          name: p.name,
        });
        results.push({
          id: p.id,
          name: p.name,
          status: "planned",
          folderUrl: null,
          error: `${folderName} を検索 or 作成予定`,
        });
      }
      return Response.json({
        ok: true,
        apply: false,
        targetCount: persons.length,
        results,
      });
    }

    for (const p of persons) {
      const folderName = buildPersonFolderName({
        id: p.id,
        englishName: p.onboarding?.englishName ?? null,
        name: p.name,
      });
      try {
        const folder = await ensurePersonDriveFolder({
          existingFolderUrl: null,
          personId: p.id,
          personName: folderName,
        });
        if (!folder.folderUrl) {
          results.push({
            id: p.id,
            name: p.name,
            status: "failed",
            folderUrl: null,
            error: "folder.folderUrl が空",
          });
          continue;
        }
        await prisma.person.update({
          where: { id: p.id },
          data: { driveFolderUrl: folder.folderUrl },
        });
        // 紐づけと新規作成の区別は API から取れないので linked に統一
        results.push({
          id: p.id,
          name: p.name,
          status: "linked",
          folderUrl: folder.folderUrl,
          error: null,
        });
      } catch (e) {
        results.push({
          id: p.id,
          name: p.name,
          status: "failed",
          folderUrl: null,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    const linked = results.filter((r) => r.status === "linked").length;
    const failed = results.filter((r) => r.status === "failed").length;
    return Response.json({
      ok: true,
      apply: true,
      targetCount: persons.length,
      linked,
      failed,
      results,
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 }
    );
  }
}
