/**
 * 履歴書 N ファイルを並列で Gemini AI 抽出 → 候補者データの配列を返す。
 *
 * 機能:
 *   - 並列抽出 (Promise.allSettled)
 *   - 各ファイルを UploadedFile に一時保存 (1日 expiresAt) して uploadedFileId を返す
 *     → 後続の bulk-create で Drive に再アップロード
 *   - 重複候補者検出 (既存 Person との 名前 + メール マッチ)
 *
 * 入力: multipart/form-data with files[] (PDF / JPG / PNG, 最大 10 件)
 * 出力: [{ fileName, ok, candidate?, warnings?, duplicates?, uploadedFileId?, error? }]
 */

import { prisma } from "@/lib/prisma";
import { extractCandidateFromFiles, type ExtractedCandidate, type SourceFile } from "@/lib/ai-extract";
import { AuthError, requireApiAccount } from "@/lib/auth";

const MAX_FILES = 10;
const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15MB (PDF 想定)
const ALLOWED_MIME = new Set(["application/pdf", "image/jpeg", "image/png"]);
const TEMP_FILE_TTL_HOURS = 24;

type Duplicate = { id: number; name: string; similarity: number; reason: "name" | "email" };

type ExtractItem =
  | {
      fileName: string;
      ok: true;
      candidate: ExtractedCandidate;
      warnings: string[];
      duplicates: Duplicate[];
      uploadedFileId: string;
      mimeType: string;
    }
  | { fileName: string; ok: false; error: string };

// ===== 重複検出ヘルパー =====
function normName(name: string): string {
  return name.replace(/[\s　]+/g, "").toLowerCase();
}

function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}

function similarity(a: string, b: string): number {
  const na = normName(a);
  const nb = normName(b);
  if (na === nb) return 1;
  const dist = editDistance(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1;
  return 1 - dist / maxLen;
}

function findDuplicates(
  candidate: ExtractedCandidate,
  allPersons: { id: number; name: string; email: string | null }[]
): Duplicate[] {
  const dups = new Map<number, Duplicate>();

  // 1. メール完全一致 (1.0 一致扱い)
  if (candidate.email) {
    const target = candidate.email.toLowerCase().trim();
    for (const p of allPersons) {
      if (p.email && p.email.toLowerCase().trim() === target) {
        dups.set(p.id, { id: p.id, name: p.name, similarity: 1, reason: "email" });
      }
    }
  }

  // 2. 名前類似度 ≥ 85%
  if (candidate.name) {
    for (const p of allPersons) {
      const sim = similarity(candidate.name, p.name);
      if (sim >= 0.85) {
        const existing = dups.get(p.id);
        // メール一致のほうが優先 (信頼度高)
        if (!existing || sim > existing.similarity) {
          dups.set(p.id, { id: p.id, name: p.name, similarity: sim, reason: "name" });
        }
      }
    }
  }

  return Array.from(dups.values()).sort((a, b) => b.similarity - a.similarity);
}

export async function POST(req: Request) {
  try {
    await requireApiAccount();
    const form = await req.formData();
    const files = form.getAll("files").filter((f): f is File => f instanceof File);

    if (files.length === 0) {
      return Response.json({ ok: false, error: "ファイルが添付されていません" }, { status: 400 });
    }
    if (files.length > MAX_FILES) {
      return Response.json(
        { ok: false, error: `一度に処理できるのは最大 ${MAX_FILES} ファイルまでです (受信: ${files.length})` },
        { status: 400 }
      );
    }
    for (const f of files) {
      if (!ALLOWED_MIME.has(f.type)) {
        return Response.json(
          { ok: false, error: `サポート外の形式: ${f.name} (${f.type})` },
          { status: 400 }
        );
      }
      if (f.size > MAX_FILE_BYTES) {
        return Response.json(
          { ok: false, error: `「${f.name}」が大きすぎます (上限 ${MAX_FILE_BYTES / 1024 / 1024}MB)` },
          { status: 400 }
        );
      }
    }

    // ファイル → SourceFile (base64) に変換 + UploadedFile に一時保存
    const expiresAt = new Date(Date.now() + TEMP_FILE_TTL_HOURS * 60 * 60 * 1000);
    const prepared: { source: SourceFile; fileName: string; mimeType: string; uploadedFileId: string }[] = [];
    for (const f of files) {
      const buf = Buffer.from(await f.arrayBuffer());
      const base64 = buf.toString("base64");
      const saved = await prisma.uploadedFile.create({
        data: {
          filename: f.name,
          mimeType: f.type,
          sizeBytes: f.size,
          data: buf,
          expiresAt,
        },
        select: { id: true },
      });
      prepared.push({
        source: { fileName: f.name, mimeType: f.type, base64 },
        fileName: f.name,
        mimeType: f.type,
        uploadedFileId: saved.id,
      });
    }

    // 既存 Person を 1 回ロード (重複判定用)
    const allPersons = await prisma.person.findMany({
      select: { id: true, name: true, email: true },
    });

    // 並列抽出
    const results = await Promise.allSettled(
      prepared.map((p) => extractCandidateFromFiles([p.source]))
    );

    const items: ExtractItem[] = results.map((r, idx) => {
      const { fileName, mimeType, uploadedFileId } = prepared[idx];
      if (r.status === "fulfilled") {
        const { _warnings = [], ...rest } = r.value;
        const duplicates = findDuplicates(rest, allPersons);
        return {
          fileName,
          ok: true,
          candidate: rest,
          warnings: _warnings,
          duplicates,
          uploadedFileId,
          mimeType,
        };
      }
      return {
        fileName,
        ok: false,
        error: r.reason instanceof Error ? r.reason.message : String(r.reason),
      };
    });

    return Response.json({ ok: true, items });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 }
    );
  }
}
