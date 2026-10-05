/**
 * 既存の日本語チェック録音を、候補者フォルダの外へ移す (要ログイン)。
 *
 * GET /api/admin/move-japanese-check-audio          ドライラン (何を移すか返すだけ)
 * GET /api/admin/move-japanese-check-audio?apply=1  実行
 *
 * 候補者フォルダのリンクは企業にも共有するため、録音は
 *   候補者ルート/日本語チェック音声/0012_NAME_日本語チェック音声/
 * に集約する。Drive のファイル ID は移動しても変わらないので、
 * 管理画面での再生 (/api/audio-proxy?id=…) はそのまま動く。
 */

import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";
import {
  buildPersonFolderName,
  ensureJapaneseCheckAudioFolder,
  moveDriveFile,
  parseGoogleDriveFolderId,
  trashFolderIfEmpty,
  findFolderByPrefix,
  JAPANESE_CHECK_AUDIO_ROOT_NAME,
} from "@/lib/google-docs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Recording = { driveFileId?: string | null };

export async function GET(req: Request) {
  try {
    await requireApiAccount();
    const apply = new URL(req.url).searchParams.get("apply") === "1";

    const checks = await prisma.personJapaneseCheck.findMany({
      select: {
        personId: true,
        recordings: true,
        person: {
          select: {
            id: true,
            name: true,
            driveFolderUrl: true,
            onboarding: { select: { englishName: true } },
          },
        },
      },
      orderBy: { personId: "asc" },
    });

    const result = {
      apply,
      persons: 0,
      movedFiles: 0,
      alreadyThere: 0,
      failed: [] as { personId: number; error: string }[],
      trashedEmptyFolders: 0,
    };

    for (const check of checks) {
      const files = (Array.isArray(check.recordings) ? (check.recordings as Recording[]) : [])
        .map((r) => (typeof r?.driveFileId === "string" ? r.driveFileId : null))
        .filter((id): id is string => Boolean(id));
      if (files.length === 0) continue;
      result.persons++;
      if (!apply) {
        result.movedFiles += files.length;
        continue;
      }
      try {
        const personFolderName = buildPersonFolderName({
          id: check.person.id,
          englishName: check.person.onboarding?.englishName ?? null,
          name: check.person.name,
        });
        const target = await ensureJapaneseCheckAudioFolder({ personFolderName });
        const targetId = target.folderId ?? parseGoogleDriveFolderId(target.folderUrl);
        if (!targetId) throw new Error("移動先フォルダの ID を解決できません");

        for (const fileId of files) {
          const r = await moveDriveFile({ fileId, toFolderId: targetId });
          if (r.moved) result.movedFiles++;
          else result.alreadyThere++;
        }

        // 候補者フォルダに残った空の「日本語チェック音声」サブフォルダを片付ける
        if (check.person.driveFolderUrl) {
          const old = await findFolderByPrefix({
            parentFolderUrl: check.person.driveFolderUrl,
            namePrefix: JAPANESE_CHECK_AUDIO_ROOT_NAME,
          });
          if (old && (await trashFolderIfEmpty(old.folderId))) result.trashedEmptyFolders++;
        }
      } catch (e) {
        result.failed.push({
          personId: check.personId,
          error: e instanceof Error ? e.message : "error",
        });
      }
    }

    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 },
    );
  }
}
