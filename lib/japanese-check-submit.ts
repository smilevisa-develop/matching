/**
 * 日本語チェックの録音を受け取って保存・判定する共通処理。
 *
 * 呼び出し元:
 *   - POST /api/japanese-check/[token]        (日本語チェック専用リンク: 現行)
 *   - POST /api/intake/[token]/japanese-check (旧: 入力フォーム同梱版。既存リンク救済用)
 *
 * 流れ: 録音を Drive の「日本語チェック音声」フォルダへ保存 → AI で判定 → DB へ upsert。
 * 判定に失敗しても録音は残し、管理画面から再判定できる状態にする。
 */

import { prisma } from "./prisma";
import {
  buildPersonAssetName,
  buildPersonFolderName,
  ensurePersonDriveFolder,
  ensureSubFolder,
  uploadDataUrlToDrive,
} from "./google-docs";
import { extractDriveFileId } from "./drive-url";
import {
  JAPANESE_CHECK_QUESTIONS,
  judgeJapaneseFromAudio,
  type JapaneseCheckRecording,
} from "./japanese-check";

/** クライアントから届く 1 問ぶんの録音 */
export type IncomingRecording = {
  key: string;
  dataUrl: string;
  /** クライアントが計測した録音の長さ (秒)。話す速さの算出に使う */
  seconds?: number | null;
};

export type SubmitResult =
  | { ok: true; assessed: true; estimatedLevel: string }
  | { ok: true; assessed: false; warning: string }
  | { ok: false; error: string; status: number };

function parseDataUrl(dataUrl: string): { mimeType: string; base64: string } | null {
  // MIME に codecs 等のパラメータが付く場合がある
  //   例: "data:audio/webm;codecs=opus;base64,...." (Android Chrome など)
  // ";base64," が MIME 直後とは限らないため、";base64," で分割する。
  const m = dataUrl.match(/^data:([^,]+);base64,(.+)$/);
  if (!m) return null;
  // codecs 等のパラメータを落として基本 MIME (例: audio/webm) にする
  const mimeType = m[1].split(";")[0].trim();
  return { mimeType, base64: m[2] };
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

/**
 * 録音を保存し、日本語レベルを判定して DB に書き込む。
 * @param personId 対象候補者
 * @param incoming クライアントから届いた録音の配列
 */
export async function submitJapaneseCheck(
  personId: number,
  incoming: unknown,
): Promise<SubmitResult> {
  const person = await prisma.person.findUnique({
    where: { id: personId },
    select: {
      id: true,
      name: true,
      driveFolderUrl: true,
      onboarding: { select: { englishName: true } },
    },
  });
  if (!person) return { ok: false, error: "候補者が見つかりません", status: 404 };

  const list = Array.isArray(incoming) ? incoming : [];
  const parsed: {
    key: string;
    dataUrl: string;
    mimeType: string;
    base64: string;
    seconds: number | null;
  }[] = [];
  for (const r of list) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    if (typeof o.key !== "string" || typeof o.dataUrl !== "string") continue;
    if (!JAPANESE_CHECK_QUESTIONS.some((q) => q.key === o.key)) continue;
    const p = parseDataUrl(o.dataUrl);
    if (!p) continue;
    const seconds = typeof o.seconds === "number" && o.seconds > 0 ? o.seconds : null;
    parsed.push({ key: o.key, dataUrl: o.dataUrl, mimeType: p.mimeType, base64: p.base64, seconds });
  }
  if (parsed.length === 0) return { ok: false, error: "録音データがありません", status: 400 };

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

  // 候補者フォルダ内に「日本語チェック音声」サブフォルダを確保し、録音はそこにまとめる
  const audioFolder = await ensureSubFolder({
    parentFolderUrl: folder.folderUrl!,
    folderName: "日本語チェック音声",
  });

  // 各録音を Drive に保存
  const stored: {
    key: string;
    driveFileId: string | null;
    driveFileUrl: string;
    mimeType: string;
    seconds: number | null;
  }[] = [];
  for (const r of parsed) {
    const q = JAPANESE_CHECK_QUESTIONS.find((x) => x.key === r.key);
    const assetName = `日本語チェック_${q?.key ?? r.key}`;
    const uploaded = await uploadDataUrlToDrive({
      dataUrl: r.dataUrl,
      fileName: `${buildPersonAssetName({ person: personForName, assetName })}${extForMime(r.mimeType)}`,
      folderUrl: audioFolder.folderUrl,
    });
    stored.push({
      key: r.key,
      driveFileId: extractDriveFileId(uploaded.fileUrl),
      driveFileUrl: uploaded.fileUrl,
      mimeType: r.mimeType,
      seconds: r.seconds,
    });
  }

  /** DB に残す録音メタ (文字起こしは判定後に合流する) */
  const baseRecordings = stored.map((s) => ({
    key: s.key,
    question: JAPANESE_CHECK_QUESTIONS.find((q) => q.key === s.key)?.prompt ?? "",
    transcript: "",
    driveFileId: s.driveFileId,
    driveFileUrl: s.driveFileUrl,
    mimeType: s.mimeType,
    seconds: s.seconds,
  }));

  // AI で観察 → ルールで判定
  const forJudge: JapaneseCheckRecording[] = parsed.map((r) => ({
    key: r.key,
    mimeType: r.mimeType,
    base64: r.base64,
    seconds: r.seconds,
  }));
  let judged;
  try {
    judged = await judgeJapaneseFromAudio(forJudge);
  } catch (err) {
    // 判定に失敗しても録音は保存済み。管理側から再判定できるよう
    // recordings だけ保存して assessedAt は null にする
    await prisma.personJapaneseCheck.upsert({
      where: { personId: person.id },
      create: { personId: person.id, recordings: baseRecordings },
      update: { recordings: baseRecordings, assessedAt: null },
    });
    return {
      ok: true,
      assessed: false,
      warning: `録音は保存しましたが、AI 判定に失敗しました: ${err instanceof Error ? err.message : "error"}`,
    };
  }

  // recordings に文字起こしを合流
  const recordings = baseRecordings.map((r) => ({
    ...r,
    transcript: judged.transcripts.find((t) => t.key === r.key)?.transcript ?? "",
  }));

  const data = {
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
  };
  await prisma.personJapaneseCheck.upsert({
    where: { personId: person.id },
    create: { personId: person.id, ...data },
    update: data,
  });

  return { ok: true, assessed: true, estimatedLevel: judged.estimatedLevel };
}
