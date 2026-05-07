/**
 * 求人票 PDF パイプライン API。
 *
 * フロー:
 *  1. multipart/form-data で PDF を受信
 *  2. lib/pdf.ts でページごとにテキスト抽出 (rawText + items)
 *  3. lib/job-sheet/segmenter.ts でセクション別 chunk に分割
 *  4. 各セクションを lib/job-sheet/extractors/* に渡して Gemini で意味解釈
 *  5. ParsedJobSheet にマージ
 *  6. lib/job-sheet/mapper.ts で既存 JobPosting フィールド形式へ変換
 *
 * レスポンス:
 *  {
 *    success: true,
 *    pages: [{ pageNumber, rawText }],
 *    parsedJobs: [ParsedJobSheet],
 *    mappedJobs: [JobPostingFieldsBody],   // UI のレビュー画面はこれを使う
 *    errors: [],
 *    debug: { sections, gemini }
 *  }
 */

import { AuthError, requireApiAccount } from "@/lib/auth";
import { extractPdfPages } from "@/lib/pdf";
import { segmentPage } from "@/lib/job-sheet/segmenter";
import { extractCompanySection } from "@/lib/job-sheet/extractors/company";
import { extractJobSection, extractEmploymentSection } from "@/lib/job-sheet/extractors/job";
import { extractSalarySection, extractDeductionsSection } from "@/lib/job-sheet/extractors/salary";
import { extractWorkingHoursSection } from "@/lib/job-sheet/extractors/workingHours";
import { extractHousingSection } from "@/lib/job-sheet/extractors/housing";
import { extractBenefitsSection } from "@/lib/job-sheet/extractors/benefits";
import { extractMiscSection } from "@/lib/job-sheet/extractors/misc";
import { emptyParsedJobSheet, type ParsedJobSheet, type SectionChunk } from "@/lib/job-sheet/types";
import { toJobPostingBody, type JobPostingFieldsBody } from "@/lib/job-sheet/mapper";
import type { GeminiSectionDebug } from "@/lib/gemini";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    await requireApiAccount();

    const contentType = req.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return Response.json(
        { success: false, error: "multipart/form-data でアップロードしてください" },
        { status: 400 }
      );
    }
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ success: false, error: "file フィールドが必要です" }, { status: 400 });
    }
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      return Response.json({ success: false, error: "PDF ファイルを指定してください" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Step A & B: ページごとのテキスト抽出
    const pages = await extractPdfPages(buffer).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`PDF 読み取りに失敗しました: ${msg}`);
    });

    // テキストが全く取れなかった場合 (スキャン PDF など)
    const totalText = pages.reduce((sum, p) => sum + (p.text?.length ?? 0), 0);
    if (totalText === 0) {
      return Response.json({
        success: false,
        error:
          "PDF からテキストを抽出できませんでした。スキャン PDF (画像のみ) の可能性があります。テキストレイヤー付き PDF に書き出してから再度お試しください。",
        pages: pages.map((p) => ({ pageNumber: p.pageNumber, rawText: "" })),
      });
    }

    if (pages.length === 0) {
      return Response.json({
        success: false,
        error: "PDF からページを取り出せませんでした",
      });
    }

    const errors: string[] = [];
    const debugSections: { pageNumber: number; chunks: SectionChunk[] }[] = [];
    const debugGemini: { pageNumber: number; section: string; debug: GeminiSectionDebug }[] = [];
    const parsedJobs: ParsedJobSheet[] = [];

    for (const page of pages) {
      const parsed = emptyParsedJobSheet(file.name, page.pageNumber);
      parsed.rawText = page.text;

      // Step C/D: セクション分割
      const segment = segmentPage(page.text);
      debugSections.push({ pageNumber: page.pageNumber, chunks: segment.chunks });

      const sectionByKey = new Map(segment.chunks.map((c) => [c.section, c.text]));

      // Step E: セクションごとに Gemini で抽出 (順次, 1 ページあたり最大 8 リクエスト)
      try {
        if (sectionByKey.has("company")) {
          const r = await extractCompanySection(sectionByKey.get("company")!);
          parsed.company = r.data;
          debugGemini.push({ pageNumber: page.pageNumber, section: "company", debug: r.debug });
        }
        if (sectionByKey.has("job")) {
          const r = await extractJobSection(sectionByKey.get("job")!);
          parsed.job = r.data;
          debugGemini.push({ pageNumber: page.pageNumber, section: "job", debug: r.debug });
        }
        if (sectionByKey.has("employment")) {
          const r = await extractEmploymentSection(sectionByKey.get("employment")!);
          parsed.employment = r.data;
          debugGemini.push({ pageNumber: page.pageNumber, section: "employment", debug: r.debug });
        }
        if (sectionByKey.has("salary")) {
          const r = await extractSalarySection(sectionByKey.get("salary")!);
          parsed.salary = r.data;
          debugGemini.push({ pageNumber: page.pageNumber, section: "salary", debug: r.debug });
          // 控除は給与セクションと同じ text を渡す (どちらに混ざってるか分からないため)
          const d = await extractDeductionsSection(sectionByKey.get("salary")!);
          parsed.deductions = d.data;
          debugGemini.push({ pageNumber: page.pageNumber, section: "deductions", debug: d.debug });
        }
        if (sectionByKey.has("workingHours")) {
          const r = await extractWorkingHoursSection(sectionByKey.get("workingHours")!);
          parsed.workingHours = r.data;
          debugGemini.push({ pageNumber: page.pageNumber, section: "workingHours", debug: r.debug });
        }
        if (sectionByKey.has("housing")) {
          const r = await extractHousingSection(sectionByKey.get("housing")!);
          parsed.housing = r.data;
          debugGemini.push({ pageNumber: page.pageNumber, section: "housing", debug: r.debug });
        }
        if (sectionByKey.has("benefits")) {
          const r = await extractBenefitsSection(sectionByKey.get("benefits")!);
          parsed.benefits = r.data;
          debugGemini.push({ pageNumber: page.pageNumber, section: "benefits", debug: r.debug });
        }
        if (sectionByKey.has("misc")) {
          const r = await extractMiscSection(sectionByKey.get("misc")!);
          parsed.misc = r.data;
          debugGemini.push({ pageNumber: page.pageNumber, section: "misc", debug: r.debug });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "不明エラー";
        errors.push(`page ${page.pageNumber}: ${msg}`);
      }

      // confidence は debug の parsedOk 比率から概算
      const sectionDebugs = debugGemini.filter((d) => d.pageNumber === page.pageNumber);
      const okCount = sectionDebugs.filter((d) => d.debug.parsedOk).length;
      parsed.confidence.overall =
        sectionDebugs.length > 0 ? Math.round((okCount / sectionDebugs.length) * 100) / 100 : 0;

      parsedJobs.push(parsed);
    }

    // Step H: マッピング
    const mappedJobs: JobPostingFieldsBody[] = parsedJobs.map(toJobPostingBody);

    return Response.json({
      success: true,
      pages: pages.map((p) => ({ pageNumber: p.pageNumber, rawText: p.text })),
      parsedJobs,
      mappedJobs,
      errors,
      debug: {
        sections: debugSections,
        gemini: debugGemini,
      },
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 }
    );
  }
}
