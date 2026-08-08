/**
 * 日本語チェックの録音を受け取って保存・判定する共通処理。
 *
 * 呼び出し元:
 *   - POST /api/japanese-check/[token]        (日本語チェック専用リンク: 現行)
 *   - POST /api/intake/[token]/japanese-check (旧: 入力フォーム同梱版。既存リンク救済用)
 *
 * ── 候補者を待たせない二段構え ──
 * AI 判定は 20〜60 秒かかるが、その結果が必要なのは採用担当であって候補者ではない。
 * そこで処理を 2 つに分けている:
 *   1. storeJapaneseCheckRecordings … Drive へ保存 + DB 登録 (判定前)。ここまでで応答を返す
 *   2. judgeStoredJapaneseCheck    … AI 判定して DB を更新。応答後に after() で走らせる
 *
 * 保存だけは応答前に完了させる。そうしないと候補者が「送れたつもり」なのに
 * 実際は届いていない、という事故が起きるため。
 * 判定に失敗しても録音は残るので、管理画面の「再判定」でやり直せる。
 */

import { prisma } from "./prisma";
import { Prisma } from "@/generated/prisma/client";
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

/** 保存まで終わった時点の結果。forJudge は後段の AI 判定に渡す */
export type StoreResult =
  | { ok: true; count: number; forJudge: JapaneseCheckRecording[] }
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
 * 録音を Drive に保存し、判定前の状態で DB に登録する (応答前に行う処理)。
 * @param personId 対象候補者
 * @param incoming クライアントから届いた録音の配列
 */
export async function storeJapaneseCheckRecordings(
  personId: number,
  incoming: unknown,
): Promise<StoreResult> {
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

  // 各録音を Drive に保存。
  // 5 件を順番に上げると待ち時間がそのまま 5 倍になるので並列で投げる。
  const stored = await Promise.all(
    parsed.map(async (r) => {
      const q = JAPANESE_CHECK_QUESTIONS.find((x) => x.key === r.key);
      const assetName = `日本語チェック_${q?.key ?? r.key}`;
      const uploaded = await uploadDataUrlToDrive({
        dataUrl: r.dataUrl,
        fileName: `${buildPersonAssetName({ person: personForName, assetName })}${extForMime(r.mimeType)}`,
        folderUrl: audioFolder.folderUrl,
      });
      return {
        key: r.key,
        driveFileId: extractDriveFileId(uploaded.fileUrl),
        driveFileUrl: uploaded.fileUrl,
        mimeType: r.mimeType,
        seconds: r.seconds,
      };
    }),
  );

  /** DB に残す録音メタ (文字起こしと判定結果は後段で合流する) */
  const baseRecordings = stored.map((s) => ({
    key: s.key,
    question: JAPANESE_CHECK_QUESTIONS.find((q) => q.key === s.key)?.prompt ?? "",
    transcript: "",
    driveFileId: s.driveFileId,
    driveFileUrl: s.driveFileUrl,
    mimeType: s.mimeType,
    seconds: s.seconds,
  }));

  // 判定前の状態で登録する。管理画面では「判定待ち」と表示される。
  await prisma.personJapaneseCheck.upsert({
    where: { personId: person.id },
    create: { personId: person.id, recordings: baseRecordings },
    update: {
      recordings: baseRecordings,
      // 録り直しの再送なので、前回の判定結果は残さない
      assessedAt: null,
      estimatedLevel: null,
      pronunciation: null,
      fluency: null,
      vocabulary: null,
      grammar: null,
      summary: null,
      levelReason: null,
      confidence: null,
      // Json 列を SQL NULL に戻すには DbNull を渡す (undefined は「変更しない」の意味)
      evidence: Prisma.DbNull,
    },
  });

  return {
    ok: true,
    count: baseRecordings.length,
    forJudge: parsed.map((r) => ({
      key: r.key,
      mimeType: r.mimeType,
      base64: r.base64,
      seconds: r.seconds,
    })),
  };
}

/**
 * 保存済みの録音を AI に観察させ、ルールで判定して DB を更新する (応答後に走らせる処理)。
 * 失敗しても録音は残っているので、管理画面の「再判定」でやり直せる。
 */
export async function judgeStoredJapaneseCheck(
  personId: number,
  forJudge: JapaneseCheckRecording[],
): Promise<void> {
  if (forJudge.length === 0) return;
  try {
    const judged = await judgeJapaneseFromAudio(forJudge);

    // 保存済みの録音メタに文字起こしを合流させる
    const existing = await prisma.personJapaneseCheck.findUnique({
      where: { personId },
      select: { recordings: true },
    });
    const base = Array.isArray(existing?.recordings)
      ? (existing.recordings as unknown as Record<string, unknown>[])
      : [];
    const recordings = base.map((r) => ({
      ...r,
      transcript:
        judged.transcripts.find((t) => t.key === r.key)?.transcript ?? r.transcript ?? "",
    }));

    await prisma.personJapaneseCheck.update({
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
  } catch (err) {
    // 判定できなくても録音は残す。assessedAt は null のままなので
    // 管理画面には「判定待ち」と出て、再判定ボタンからやり直せる。
    console.warn(
      `japanese-check 判定に失敗 (personId=${personId}):`,
      err instanceof Error ? err.message : err,
    );
  }
}
