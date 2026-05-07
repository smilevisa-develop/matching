import { geminiExtractSection, type GeminiSectionDebug } from "@/lib/gemini";
import type { JobSheetCompany } from "@/lib/job-sheet/types";

const SCHEMA = `{
  "name": "事業所名 / 会社名",
  "representative": "代表者名 (なければ空)",
  "address": "本社所在地",
  "tel": "電話番号 (ハイフン込みでよい)",
  "fax": "FAX 番号 (なければ空)",
  "businessDescription": "主な事業内容を 1〜2 文で"
}`;

export async function extractCompanySection(
  text: string
): Promise<{ data: JobSheetCompany; debug: GeminiSectionDebug }> {
  const fallback: JobSheetCompany = {
    name: "",
    representative: "",
    address: "",
    tel: "",
    fax: "",
    businessDescription: "",
  };
  const { data, debug } = await geminiExtractSection<Partial<JobSheetCompany>>({
    sectionName: "company",
    text,
    schemaDescription: SCHEMA,
  });
  return {
    data: { ...fallback, ...(data ?? {}) },
    debug,
  };
}
