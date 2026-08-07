/**
 * 管理側の 日本語チェック 再判定 (要ログイン)。
 *
 * POST /api/personnel/[id]/japanese-check/rejudge
 *
 * intake 送信時に AI 判定が失敗して録音だけ保存された場合や、
 * 判定をやり直したい場合に、Drive 上の録音を取り直して Gemini に再判定させる。
 *
 * 処理:
 *   1. PersonJapaneseCheck.recordings から driveFileId を取得
 *   2. Service Account 権限で音声を base64 取得
 *   3. judgeJapaneseFromAudio で再判定
 *   4. DB を更新して最新の結果を返す
 */

import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";
import { google } from "googleapis";
import {
  JAPANESE_CHECK_QUESTIONS,
  judgeJapaneseFromAudio,
  type JapaneseCheckRecording,
} from "@/lib/japanese-check";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Params = Promise<{ id: string }>;

type StoredRecording = {
  key: string;
  question: string;
  transcript: string;
  driveFileId: string | null;
  driveFileUrl: string | null;
  mimeType: string;
  /** 録音の長さ (秒)。話す速さの算出に使う。切り出し前の古いデータには無い */
  seconds?: number | null;
};

async function getDriveClient() {
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

export async function POST(_req: Request, ctx: { params: Params }) {
  try {
    await requireApiAccount();

    const { id } = await ctx.params;
    const personId = Number(id);
    if (!Number.isFinite(personId)) {
      return Response.json({ ok: false, error: "無効なIDです" }, { status: 400 });
    }

    const existing = await prisma.personJapaneseCheck.findUnique({
      where: { personId },
    });
    if (!existing) {
      return Response.json({ ok: false, error: "日本語チェックの記録がありません" }, { status: 404 });
    }

    const stored: StoredRecording[] = Array.isArray(existing.recordings)
      ? (existing.recordings as unknown as StoredRecording[])
      : [];
    const withFile = stored.filter((r) => r && r.driveFileId);
    if (withFile.length === 0) {
      return Response.json(
        { ok: false, error: "再判定できる録音ファイルがありません" },
        { status: 400 },
      );
    }

    // Drive から音声を取得して base64 化
    const drive = await getDriveClient();
    const forJudge: JapaneseCheckRecording[] = [];
    for (const r of withFile) {
      try {
        const meta = await drive.files.get({
          fileId: r.driveFileId!,
          fields: "id,mimeType",
          supportsAllDrives: true,
        });
        const mimeType = r.mimeType || meta.data.mimeType || "audio/webm";
        const res = await drive.files.get(
          { fileId: r.driveFileId!, alt: "media", supportsAllDrives: true },
          { responseType: "arraybuffer" },
        );
        const base64 = Buffer.from(res.data as ArrayBuffer).toString("base64");
        forJudge.push({ key: r.key, mimeType, base64, seconds: r.seconds ?? null });
      } catch {
        // 1 ファイル取得失敗は無視して続行
      }
    }
    if (forJudge.length === 0) {
      return Response.json(
        { ok: false, error: "Drive から録音を取得できませんでした" },
        { status: 500 },
      );
    }

    const judged = await judgeJapaneseFromAudio(forJudge);

    // 文字起こしを既存録音に合流 (Drive 情報は保持)
    const recordings = stored.map((s) => ({
      key: s.key,
      question:
        s.question || JAPANESE_CHECK_QUESTIONS.find((q) => q.key === s.key)?.prompt || "",
      transcript: judged.transcripts.find((t) => t.key === s.key)?.transcript ?? s.transcript ?? "",
      driveFileId: s.driveFileId,
      driveFileUrl: s.driveFileUrl,
      mimeType: s.mimeType,
      seconds: s.seconds ?? null,
    }));

    const updated = await prisma.personJapaneseCheck.update({
      where: { personId },
      data: {
        estimatedLevel: judged.estimatedLevel,
        pronunciation: judged.pronunciation,
        fluency: judged.fluency,
        vocabulary: judged.vocabulary,
        grammar: judged.grammar,
        summary: judged.summary,
        levelReason: judged.levelReason,
        confidence: judged.confidence,
        evidence: judged.evidence as unknown as object,
        recordings,
        assessedAt: new Date(),
      },
    });

    return Response.json({
      ok: true,
      check: {
        estimatedLevel: updated.estimatedLevel,
        pronunciation: updated.pronunciation,
        fluency: updated.fluency,
        vocabulary: updated.vocabulary,
        grammar: updated.grammar,
        summary: updated.summary,
        levelReason: updated.levelReason,
        confidence: updated.confidence,
        evidence: updated.evidence,
        recordings,
        assessedAt: updated.assessedAt ? updated.assessedAt.toISOString() : null,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ ok: false, error: "認証が必要です" }, { status: 401 });
    }
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: 500 },
    );
  }
}
