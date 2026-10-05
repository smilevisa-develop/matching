/**
 * 既存の日本語チェック録音を、候補者フォルダの外へ移す (要ログイン)。
 *
 * GET /api/admin/move-japanese-check-audio                 ドライラン (残り件数を数えるだけ)
 * GET /api/admin/move-japanese-check-audio?apply=1         実行 (既定で 8 人ぶんずつ)
 * GET /api/admin/move-japanese-check-audio?apply=1&limit=5 1 回で処理する人数を指定
 *
 * 候補者フォルダのリンクは企業にも共有するため、録音は
 *   候補者ルート/日本語チェック音声/0012_NAME_日本語チェック音声/
 * に集約する。Drive のファイル ID は移動しても変わらないので、
 * 管理画面での再生 (/api/audio-proxy?id=…) はそのまま動く。
 *
 * Drive の API 呼び出しが多く 1 回のリクエストでは終わらないため、
 * 「まだ移していない人」だけを limit 人ずつ処理する。remaining が 0 になるまで繰り返し叩く。
 */

import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";
import {
  buildJapaneseCheckAudioFolderName,
  buildPersonFolderName,
  ensureJapaneseCheckAudioFolder,
  ensureJapaneseCheckAudioRootFolder,
  findFolderByPrefix,
  listFolderChildrenCount,
  moveDriveFile,
  parseGoogleDriveFolderId,
  trashFolderIfEmpty,
  JAPANESE_CHECK_AUDIO_ROOT_NAME,
} from "@/lib/google-docs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Recording = { driveFileId?: string | null };

export async function GET(req: Request) {
  try {
    await requireApiAccount();
    const url = new URL(req.url);
    const apply = url.searchParams.get("apply") === "1";
    const limit = Math.max(1, Math.min(30, Number(url.searchParams.get("limit") ?? 8)));

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

    // 移動先の親 (候補者ルート/日本語チェック音声) を 1 回だけ確保する
    const audioRoot = await ensureJapaneseCheckAudioRootFolder();

    const result = {
      apply,
      limit,
      /** 今回処理した人数 */
      processed: 0,
      movedFiles: 0,
      /** 既に移動済みだった人数 */
      alreadyDone: 0,
      /** まだ移していない人数 (今回処理したぶんを除く) */
      remaining: 0,
      trashedEmptyFolders: 0,
      failed: [] as { personId: number; error: string }[],
      done: false,
    };

    for (const check of checks) {
      const files = (Array.isArray(check.recordings) ? (check.recordings as Recording[]) : [])
        .map((r) => (typeof r?.driveFileId === "string" ? r.driveFileId : null))
        .filter((id): id is string => Boolean(id));
      if (files.length === 0) continue;

      const personFolderName = buildPersonFolderName({
        id: check.person.id,
        englishName: check.person.onboarding?.englishName ?? null,
        name: check.person.name,
      });
      const targetName = buildJapaneseCheckAudioFolderName(personFolderName);

      // 既に移動済みか (移動先フォルダに録音の数だけ入っているか) を確認する
      try {
        const existing = await findFolderByPrefix({
          parentFolderUrl: audioRoot.folderUrl,
          namePrefix: targetName,
        });
        if (existing) {
          const count = await listFolderChildrenCount(existing.folderId);
          if (count >= files.length) {
            result.alreadyDone++;
            continue;
          }
        }
      } catch {
        // 確認に失敗したら移動処理に進む (冪等なので二重に動かしても害はない)
      }

      // まだのぶん: limit に達していれば remaining に数えるだけ
      if (!apply || result.processed >= limit) {
        result.remaining++;
        continue;
      }

      try {
        const target = await ensureJapaneseCheckAudioFolder({ personFolderName });
        const targetId = target.folderId ?? parseGoogleDriveFolderId(target.folderUrl);
        if (!targetId) throw new Error("移動先フォルダの ID を解決できません");

        for (const fileId of files) {
          const r = await moveDriveFile({ fileId, toFolderId: targetId });
          if (r.moved) result.movedFiles++;
        }

        // 候補者フォルダに残った空の「日本語チェック音声」サブフォルダを片付ける
        if (check.person.driveFolderUrl) {
          const old = await findFolderByPrefix({
            parentFolderUrl: check.person.driveFolderUrl,
            namePrefix: JAPANESE_CHECK_AUDIO_ROOT_NAME,
          });
          if (old && (await trashFolderIfEmpty(old.folderId))) result.trashedEmptyFolders++;
        }
        result.processed++;
      } catch (e) {
        result.failed.push({
          personId: check.personId,
          error: e instanceof Error ? e.message : "error",
        });
        result.processed++;
      }
    }

    result.done = result.remaining === 0;
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 },
    );
  }
}
