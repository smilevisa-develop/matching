/**
 * 履歴書 N ファイルを並列で Gemini AI 抽出 → 候補者データの配列を返す。
 *
 * 入力: multipart/form-data with files[] (PDF / JPG / PNG, 最大 10 件)
 * 出力: [{ fileName, ok, candidate?, warnings?, error? }]
 *
 * 各ファイルは独立にエラー処理: 1 ファイル失敗が全体を止めない。
 */

import { extractCandidateFromFiles, type ExtractedCandidate, type SourceFile } from "@/lib/ai-extract";
import { AuthError, requireApiAccount } from "@/lib/auth";

const MAX_FILES = 10;
const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15MB / ファイル (PDF 想定)

type ExtractItem =
  | { fileName: string; ok: true; candidate: ExtractedCandidate; warnings: string[] }
  | { fileName: string; ok: false; error: string };

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
      if (f.size > MAX_FILE_BYTES) {
        return Response.json(
          { ok: false, error: `「${f.name}」が大きすぎます (上限 ${MAX_FILE_BYTES / 1024 / 1024}MB)` },
          { status: 400 }
        );
      }
    }

    // ファイル → SourceFile (base64) に変換
    const sources: { source: SourceFile; fileName: string }[] = [];
    for (const f of files) {
      const buf = Buffer.from(await f.arrayBuffer());
      sources.push({
        source: { fileName: f.name, mimeType: f.type, base64: buf.toString("base64") },
        fileName: f.name,
      });
    }

    // 並列抽出 (Promise.allSettled で 1 件失敗が全体を止めないように)
    const results = await Promise.allSettled(
      sources.map((s) => extractCandidateFromFiles([s.source]))
    );

    const items: ExtractItem[] = results.map((r, idx) => {
      const fileName = sources[idx].fileName;
      if (r.status === "fulfilled") {
        const { _warnings = [], ...rest } = r.value;
        return { fileName, ok: true, candidate: rest, warnings: _warnings };
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
