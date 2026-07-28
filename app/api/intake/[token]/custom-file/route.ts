/**
 * 候補者向け intake フォームの「ファイル型 個別質問」の受け口 (token 認証、未ログイン可)。
 *
 * POST /api/intake/[token]/custom-file
 *   body: { fileName: string, dataUrl: string }   dataUrl は "data:...;base64,..."
 *
 * 候補者がアップロードしたファイルを、その候補者の Drive フォルダに保存して URL を返す。
 * 返した URL を IntakeClient 側が回答 (interviewAnswers) に載せて本送信する。
 */

import { prisma } from "@/lib/prisma";
import {
  buildPersonAssetName,
  buildPersonFolderName,
  ensurePersonDriveFolder,
  uploadDataUrlToDrive,
} from "@/lib/google-docs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function parseDataUrl(dataUrl: string): { mimeType: string } | null {
  // MIME に codecs 等のパラメータが付くことがあるので、最後の ";base64," で分割する
  const m = dataUrl.match(/^data:([^,]+);base64,(.+)$/);
  if (!m) return null;
  return { mimeType: m[1].split(";")[0].trim() };
}

/** ファイル名の拡張子を安全に取り出す (無ければ空) */
function extOf(name: string): string {
  const m = name.match(/(\.[A-Za-z0-9]{1,8})$/);
  return m ? m[1] : "";
}

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await ctx.params;
    if (!token || token.length < 8) {
      return Response.json({ ok: false, error: "無効なリンクです" }, { status: 400 });
    }

    const person = await prisma.person.findUnique({
      where: { intakeToken: token },
      select: {
        id: true,
        name: true,
        driveFolderUrl: true,
        onboarding: { select: { englishName: true } },
      },
    });
    if (!person) {
      return Response.json({ ok: false, error: "リンクが無効です" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const dataUrl = typeof body?.dataUrl === "string" ? body.dataUrl : "";
    const rawName = typeof body?.fileName === "string" ? body.fileName : "file";
    const parsed = parseDataUrl(dataUrl);
    if (!parsed) {
      return Response.json({ ok: false, error: "ファイルデータが不正です" }, { status: 400 });
    }

    const personForName = {
      id: person.id,
      englishName: person.onboarding?.englishName ?? null,
      name: person.name,
    };
    const folder = await ensurePersonDriveFolder({
      existingFolderUrl: person.driveFolderUrl,
      personId: person.id,
      personName: buildPersonFolderName(personForName),
    });
    if (person.driveFolderUrl !== folder.folderUrl && folder.folderUrl) {
      await prisma.person.update({
        where: { id: person.id },
        data: { driveFolderUrl: folder.folderUrl },
      });
    }

    // ファイル名: 候補者プレフィックス + 元のファイル名 (拡張子を保持)
    const baseName = rawName.replace(/\.[A-Za-z0-9]{1,8}$/, "").slice(0, 40) || "添付ファイル";
    const fileName = `${buildPersonAssetName({ person: personForName, assetName: baseName })}${extOf(rawName)}`;
    const uploaded = await uploadDataUrlToDrive({
      dataUrl,
      fileName,
      folderUrl: folder.folderUrl!,
    });

    return Response.json({ ok: true, url: uploaded.fileUrl });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: 500 },
    );
  }
}
