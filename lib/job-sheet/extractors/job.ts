import { geminiExtractSection, type GeminiSectionDebug } from "@/lib/gemini";
import type { JobSheetJob, JobSheetEmployment } from "@/lib/job-sheet/types";

const JOB_SCHEMA = `{
  "acceptanceOccupation": "受入職種 (例: 介護職員)",
  "workLocation": "就労場所 (住所など)",
  "jobDescription": "主な仕事内容 (短い説明)",
  "recruitmentCount": "求人数 (数字+単位の文字列, 例: '3名')",
  "ageRequirement": "年齢条件 (例: '40歳以下')",
  "genderRequirement": "性別条件 (例: '不問' or '男性のみ')",
  "nationalityRequirement": "国籍条件 (例: '不問')",
  "japaneseLevelRequirement": "日本語レベル要件 (例: 'JLPT N4 以上')",
  "experienceRequirement": "経験要件",
  "otherRequirements": "その他要件"
}`;

const EMPLOYMENT_SCHEMA = `{
  "employmentType": "雇用形態",
  "employmentPeriod": "雇用期間",
  "visaType": "ビザ種類 (在留資格)",
  "field": "分野",
  "nearestStation": "最寄り駅",
  "workplace": "就業場所 (workLocation と異なる事業所)",
  "country": "勤務国 (通常 '日本')"
}`;

export async function extractJobSection(
  text: string
): Promise<{ data: JobSheetJob; debug: GeminiSectionDebug }> {
  const fallback: JobSheetJob = {
    acceptanceOccupation: "",
    workLocation: "",
    jobDescription: "",
    recruitmentCount: "",
    ageRequirement: "",
    genderRequirement: "",
    nationalityRequirement: "",
    japaneseLevelRequirement: "",
    experienceRequirement: "",
    otherRequirements: "",
  };
  const { data, debug } = await geminiExtractSection<Partial<JobSheetJob>>({
    sectionName: "job",
    text,
    schemaDescription: JOB_SCHEMA,
  });
  return { data: { ...fallback, ...(data ?? {}) }, debug };
}

export async function extractEmploymentSection(
  text: string
): Promise<{ data: JobSheetEmployment; debug: GeminiSectionDebug }> {
  const fallback: JobSheetEmployment = {
    employmentType: "",
    employmentPeriod: "",
    visaType: "",
    field: "",
    nearestStation: "",
    workplace: "",
    country: "",
  };
  const { data, debug } = await geminiExtractSection<Partial<JobSheetEmployment>>({
    sectionName: "employment",
    text,
    schemaDescription: EMPLOYMENT_SCHEMA,
  });
  return { data: { ...fallback, ...(data ?? {}) }, debug };
}
