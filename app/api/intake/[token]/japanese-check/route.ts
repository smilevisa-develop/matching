/**
 * 候補者向け 日本語チェック の受け口 (intake token 認証、未ログイン可)。
 *
 * POST /api/intake/[token]/japanese-check
 *   body: { recordings: [{ key, dataUrl }] }   dataUrl は "data:audio/...;base64,..."
 *
 * 処理:
 *   1. token から候補者を特定
 *   2. 各録音を Drive の候補者フォルダに保存
 *   3. Gemini で日本語能力を判定
 *   4. PersonJapaneseCheck に upsert (候補者 1 人 1 件)
 *
 * 音声は個人情報なので、フォーム側で同意を得た上で送る前提。
 */

import { prisma } from "@/lib/prisma";
import {
  buildPersonAssetName,
  buildPersonFolderName,
  ensurePersonDriveFolder,
  uploadDataUrlToDrive,
} from "@/lib/google-docs";
import { extractDriveFileId } from "@/lib/drive-url";
import {
  JAPANESE_CHECK_QUESTIONS,
  judgeJapaneseFromAudio,
  type JapaneseCheckRecording,
} from "@/lib/japanese-check";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function parseDataUrl(dataUrl: string): { mimeType: string; base64: string } | null {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  return { mimeType: m[1], base64: m[2] };
}

/** 音声 MIME → ファイル拡張子 */
function extForMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("webm")) return ".webm";
  if (m.includes("mp4") || m.includes("m4a") || m.includes("aac")) return ".m4a";
  if (m.includes("ogg")) return ".ogg";
  if (m.includes("wav")) return ".wav";
  if (m.includes("mpeg") || m.includes("mp3")) return ".mp3";
  return ".audio";
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

    const body = await req.json();
    const incoming = Array.isArray(body?.recordings) ? body.recordings : [];
    const parsed: { key: string; dataUrl: string; mimeType: string; base64: string }[] = [];
    for (const r of incoming) {
      if (!r || typeof r.key !== "string" || typeof r.dataUrl !== "string") continue;
      if (!JAPANESE_CHECK_QUESTIONS.some((q) => q.key === r.key)) continue;
      const p = parseDataUrl(r.dataUrl);
      if (!p) continue;
      parsed.push({ key: r.key, dataUrl: r.dataUrl, mimeType: p.mimeType, base64: p.base64 });
    }
    if (parsed.length === 0) {
      return Response.json({ ok: false, error: "録音データがありません" }, { status: 400 });
    }

    // Drive の候補者フォルダを確保
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

    // 各録音を Drive に保存
    const stored: {
      key: string;
      driveFileId: string | null;
      driveFileUrl: string;
      mimeType: string;
    }[] = [];
    for (const r of parsed) {
      const q = JAPANESE_CHECK_QUESTIONS.find((x) => x.key === r.key);
      const assetName = `日本語チェック_${q?.key ?? r.key}`;
      const uploaded = await uploadDataUrlToDrive({
        dataUrl: r.dataUrl,
        fileName: `${buildPersonAssetName({ person: personForName, assetName })}${extForMime(r.mimeType)}`,
        folderUrl: folder.folderUrl!,
      });
      stored.push({
        key: r.key,
        driveFileId: extractDriveFileId(uploaded.fileUrl),
        driveFileUrl: uploaded.fileUrl,
        mimeType: r.mimeType,
      });
    }

    // Gemini で判定
    const forJudge: JapaneseCheckRecording[] = parsed.map((r) => ({
      key: r.key,
      mimeType: r.mimeType,
      base64: r.base64,
    }));
    let judged;
    try {
      judged = await judgeJapaneseFromAudio(forJudge);
    } catch (err) {
      // 判定に失敗しても録音は保存済み。後で管理側から再判定できるよう
      // recordings だけ保存して assessedAt は null にする
      const recordings = stored.map((s) => ({
        key: s.key,
        question: JAPANESE_CHECK_QUESTIONS.find((q) => q.key === s.key)?.prompt ?? "",
        transcript: "",
        driveFileId: s.driveFileId,
        driveFileUrl: s.driveFileUrl,
        mimeType: s.mimeType,
      }));
      await prisma.personJapaneseCheck.upsert({
        where: { personId: person.id },
        create: { personId: person.id, recordings },
        update: { recordings, assessedAt: null },
      });
      return Response.json({
        ok: true,
        assessed: false,
        warning: `録音は保存しましたが、AI 判定に失敗しました: ${err instanceof Error ? err.message : "error"}`,
      });
    }

    // recordings に文字起こしを合流
    const recordings = stored.map((s) => ({
      key: s.key,
      question: JAPANESE_CHECK_QUESTIONS.find((q) => q.key === s.key)?.prompt ?? "",
      transcript: judged.transcripts.find((t) => t.key === s.key)?.transcript ?? "",
      driveFileId: s.driveFileId,
      driveFileUrl: s.driveFileUrl,
      mimeType: s.mimeType,
    }));

    await prisma.personJapaneseCheck.upsert({
      where: { personId: person.id },
      create: {
        personId: person.id,
        estimatedLevel: judged.estimatedLevel,
        pronunciation: judged.pronunciation,
        fluency: judged.fluency,
        vocabulary: judged.vocabulary,
        grammar: judged.grammar,
        summary: judged.summary,
        recordings,
        assessedAt: new Date(),
      },
      update: {
        estimatedLevel: judged.estimatedLevel,
        pronunciation: judged.pronunciation,
        fluency: judged.fluency,
        vocabulary: judged.vocabulary,
        grammar: judged.grammar,
        summary: judged.summary,
        recordings,
        assessedAt: new Date(),
      },
    });

    return Response.json({ ok: true, assessed: true, estimatedLevel: judged.estimatedLevel });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: 500 },
    );
  }
}
