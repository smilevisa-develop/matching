/**
 * 1 ページの rawText 全文を Gemini に投げて、最終 JSON スキーマに直接マッピングしてもらう。
 *
 * 役割: ルールベースのセクション分割が失敗した時の **網羅 fallback**。
 * ルールベースの結果と マージ時 は ルールベース値を優先し、空の項目だけを補完する。
 *
 * 注意:
 * - ページ全文を投げるが、これは 1 ページ単位 (要件 "全ページ一括は禁止" は守る)
 * - 推測禁止 / JSON のみ / 不明は null は他の extractor と同じプロンプト規約
 */

import { geminiExtractSection, type GeminiSectionDebug } from "@/lib/gemini";
import { normalizeYen, normalizeBool, normalizeHours, normalizeDays, normalizeShift, normalizeDate } from "@/lib/job-sheet/normalize";
import type { ParsedJobSheet, JobSheetShift } from "@/lib/job-sheet/types";

const FULL_SCHEMA = `この求人票 1 ページから読み取れる項目をすべて以下のスキーマで返してください。
読み取れない項目は null または空文字列。推測禁止。

{
  "jobCategory": "案件カテゴリ (例: '介護' '外食' '建設')",
  "caseNumber": "案件番号 (例: '14sv-001')",
  "updatedDate": "更新日 (YYYY-MM-DD)",

  "company": {
    "name": "事業所名 / 会社名",
    "representative": "代表者名",
    "address": "本社所在地",
    "tel": "電話番号 (ハイフン込み可)",
    "fax": "FAX 番号",
    "businessDescription": "主な事業内容"
  },

  "job": {
    "acceptanceOccupation": "受入職種",
    "workLocation": "就労場所",
    "jobDescription": "主な仕事内容",
    "recruitmentCount": "求人数 (例: '3名')",
    "ageRequirement": "年齢条件",
    "genderRequirement": "性別条件",
    "nationalityRequirement": "国籍条件",
    "japaneseLevelRequirement": "日本語レベル要件",
    "experienceRequirement": "経験要件",
    "otherRequirements": "その他要件"
  },

  "employment": {
    "employmentType": "雇用形態",
    "employmentPeriod": "雇用期間",
    "visaType": "ビザ種類 / 在留資格",
    "field": "分野",
    "nearestStation": "最寄り駅",
    "workplace": "事業所名",
    "country": "勤務国"
  },

  "workingHours": {
    "shifts": [{ "label": "勤務時間1", "timeRange": "9:00〜18:00", "breakMinutes": 60 }],
    "overtimeAvailable": true,
    "averageMonthlyOvertimeHours": 2.5,
    "fixedOvertimeHours": null,
    "annualHolidays": 110,
    "annualWorkingHours": null
  },

  "salary": {
    "monthlyGross": 200000,
    "baseSalary": 180000,
    "salaryCalculationMethod": "月給",
    "allowances": [
      { "name": "住宅手当", "amount": 10000, "unit": "円/月", "calculationMethod": "" }
    ],
    "bonus": { "exists": true, "amount": null, "frequency": "年2回", "note": "" }
  },

  "deductions": {
    "monthlyDeductionTotal": null,
    "healthInsurance": null,
    "pension": null,
    "employmentInsurance": null,
    "incomeTax": null,
    "residentTax": null,
    "other": null,
    "housingCost": null,
    "foodCost": null,
    "utilities": null,
    "waterCost": null,
    "wifiCost": null
  },

  "housing": {
    "dormitoryAvailable": null,
    "dormitoryCost": null,
    "maxPeoplePerRoom": null,
    "sharedRoomsAvailable": null,
    "equipment": [],
    "commuteMethod": "",
    "commuteMinutesFromHome": null
  },

  "benefits": {
    "socialInsurance": "",
    "payRaise": "",
    "holidays": "",
    "paidLeave": "",
    "mealSupport": "",
    "otherWelfare": ""
  },

  "misc": {
    "trialPeriodExists": null,
    "trialPeriodDetail": "",
    "specialNotes": "備考から賞与・住宅費の補足等を抜粋",
    "selectionFlow": "",
    "salaryClosingDate": "",
    "salaryPaymentDate": "",
    "joiningDate": "",
    "interviewDate": ""
  }
}

ルール:
- 数値はできる限り number 型 (208,040 → 208040)
- 賞与・住宅費は本表に無くても備考から拾って構わない
- 住宅費 / 食費 / 光熱費 等の控除側の数値は deductions に
- 給与の手当 (住宅手当 / 皆勤手当 / 通勤手当 / 固定残業代) は salary.allowances[] に積む`;

export async function extractFullPage(text: string): Promise<{
  data: Partial<ParsedJobSheet>;
  debug: GeminiSectionDebug;
}> {
  const { data, debug } = await geminiExtractSection<Record<string, unknown>>({
    sectionName: "fullPage",
    text,
    schemaDescription: FULL_SCHEMA,
  });
  if (!data) return { data: {}, debug };
  return { data: normalizeFullPage(data), debug };
}

/** Gemini からのざっくり JSON を ParsedJobSheet 型に寄せる (数値正規化等) */
function normalizeFullPage(raw: Record<string, unknown>): Partial<ParsedJobSheet> {
  const obj = raw as {
    jobCategory?: string;
    caseNumber?: string;
    updatedDate?: string;
    company?: Partial<ParsedJobSheet["company"]>;
    job?: Partial<ParsedJobSheet["job"]>;
    employment?: Partial<ParsedJobSheet["employment"]>;
    workingHours?: {
      shifts?: { label?: string; timeRange?: string; breakMinutes?: number | string | null }[];
      overtimeAvailable?: boolean | string | null;
      averageMonthlyOvertimeHours?: number | string | null;
      fixedOvertimeHours?: number | string | null;
      annualHolidays?: number | string | null;
      annualWorkingHours?: number | string | null;
    };
    salary?: {
      monthlyGross?: number | string | null;
      baseSalary?: number | string | null;
      salaryCalculationMethod?: string;
      allowances?: { name?: string; amount?: number | string | null; unit?: string; calculationMethod?: string }[];
      bonus?: { exists?: boolean | string | null; amount?: number | string | null; frequency?: string; note?: string };
    };
    deductions?: Record<string, number | string | null>;
    housing?: {
      dormitoryAvailable?: boolean | string | null;
      dormitoryCost?: number | string | null;
      maxPeoplePerRoom?: number | string | null;
      sharedRoomsAvailable?: boolean | string | null;
      equipment?: string[];
      commuteMethod?: string;
      commuteMinutesFromHome?: number | string | null;
    };
    benefits?: Partial<ParsedJobSheet["benefits"]>;
    misc?: {
      trialPeriodExists?: boolean | string | null;
      trialPeriodDetail?: string;
      specialNotes?: string;
      selectionFlow?: string;
      salaryClosingDate?: string;
      salaryPaymentDate?: string;
      joiningDate?: string;
      interviewDate?: string;
    };
  };

  const num = (v: number | string | null | undefined): number | null =>
    typeof v === "number" ? v : typeof v === "string" ? normalizeYen(v) : null;
  const numH = (v: number | string | null | undefined): number | null =>
    typeof v === "number" ? v : typeof v === "string" ? normalizeHours(v) : null;
  const numD = (v: number | string | null | undefined): number | null =>
    typeof v === "number" ? v : typeof v === "string" ? normalizeDays(v) : null;
  const bool = (v: boolean | string | null | undefined): boolean | null =>
    typeof v === "boolean" ? v : typeof v === "string" ? normalizeBool(v) : null;

  const shifts: JobSheetShift[] = (obj.workingHours?.shifts ?? []).map((s, i) => {
    const norm = normalizeShift(s.timeRange ?? "");
    return {
      label: s.label ?? `勤務時間${i + 1}`,
      timeRange: norm.timeRange,
      breakMinutes:
        typeof s.breakMinutes === "number"
          ? s.breakMinutes
          : norm.breakMinutes ?? null,
    };
  });

  return {
    jobCategory: obj.jobCategory ?? "",
    caseNumber: obj.caseNumber ?? "",
    updatedDate: normalizeDate(obj.updatedDate),
    company: {
      name: obj.company?.name ?? "",
      representative: obj.company?.representative ?? "",
      address: obj.company?.address ?? "",
      tel: obj.company?.tel ?? "",
      fax: obj.company?.fax ?? "",
      businessDescription: obj.company?.businessDescription ?? "",
    },
    job: {
      acceptanceOccupation: obj.job?.acceptanceOccupation ?? "",
      workLocation: obj.job?.workLocation ?? "",
      jobDescription: obj.job?.jobDescription ?? "",
      recruitmentCount: obj.job?.recruitmentCount ?? "",
      ageRequirement: obj.job?.ageRequirement ?? "",
      genderRequirement: obj.job?.genderRequirement ?? "",
      nationalityRequirement: obj.job?.nationalityRequirement ?? "",
      japaneseLevelRequirement: obj.job?.japaneseLevelRequirement ?? "",
      experienceRequirement: obj.job?.experienceRequirement ?? "",
      otherRequirements: obj.job?.otherRequirements ?? "",
    },
    employment: {
      employmentType: obj.employment?.employmentType ?? "",
      employmentPeriod: obj.employment?.employmentPeriod ?? "",
      visaType: obj.employment?.visaType ?? "",
      field: obj.employment?.field ?? "",
      nearestStation: obj.employment?.nearestStation ?? "",
      workplace: obj.employment?.workplace ?? "",
      country: obj.employment?.country ?? "",
    },
    workingHours: {
      shifts,
      overtimeAvailable: bool(obj.workingHours?.overtimeAvailable),
      averageMonthlyOvertimeHours: numH(obj.workingHours?.averageMonthlyOvertimeHours),
      fixedOvertimeHours: numH(obj.workingHours?.fixedOvertimeHours),
      annualHolidays: numD(obj.workingHours?.annualHolidays),
      annualWorkingHours: numH(obj.workingHours?.annualWorkingHours),
    },
    salary: {
      monthlyGross: num(obj.salary?.monthlyGross),
      baseSalary: num(obj.salary?.baseSalary),
      salaryCalculationMethod: obj.salary?.salaryCalculationMethod ?? "",
      allowances: (obj.salary?.allowances ?? []).map((a) => ({
        name: a.name ?? "",
        amount: num(a.amount),
        unit: a.unit ?? "",
        calculationMethod: a.calculationMethod ?? "",
      })),
      bonus: {
        exists: bool(obj.salary?.bonus?.exists),
        amount: num(obj.salary?.bonus?.amount),
        frequency: obj.salary?.bonus?.frequency ?? "",
        note: obj.salary?.bonus?.note ?? "",
      },
    },
    deductions: {
      monthlyDeductionTotal: num(obj.deductions?.monthlyDeductionTotal),
      healthInsurance: num(obj.deductions?.healthInsurance),
      pension: num(obj.deductions?.pension),
      employmentInsurance: num(obj.deductions?.employmentInsurance),
      incomeTax: num(obj.deductions?.incomeTax),
      residentTax: num(obj.deductions?.residentTax),
      other: num(obj.deductions?.other),
      housingCost: num(obj.deductions?.housingCost),
      foodCost: num(obj.deductions?.foodCost),
      utilities: num(obj.deductions?.utilities),
      waterCost: num(obj.deductions?.waterCost),
      wifiCost: num(obj.deductions?.wifiCost),
    },
    housing: {
      dormitoryAvailable: bool(obj.housing?.dormitoryAvailable),
      dormitoryCost: num(obj.housing?.dormitoryCost),
      maxPeoplePerRoom: typeof obj.housing?.maxPeoplePerRoom === "number"
        ? obj.housing!.maxPeoplePerRoom!
        : null,
      sharedRoomsAvailable: bool(obj.housing?.sharedRoomsAvailable),
      equipment: Array.isArray(obj.housing?.equipment) ? obj.housing!.equipment! : [],
      commuteMethod: obj.housing?.commuteMethod ?? "",
      commuteMinutesFromHome: typeof obj.housing?.commuteMinutesFromHome === "number"
        ? obj.housing!.commuteMinutesFromHome!
        : null,
    },
    benefits: {
      socialInsurance: obj.benefits?.socialInsurance ?? "",
      payRaise: obj.benefits?.payRaise ?? "",
      holidays: obj.benefits?.holidays ?? "",
      paidLeave: obj.benefits?.paidLeave ?? "",
      mealSupport: obj.benefits?.mealSupport ?? "",
      otherWelfare: obj.benefits?.otherWelfare ?? "",
    },
    misc: {
      trialPeriodExists: bool(obj.misc?.trialPeriodExists),
      trialPeriodDetail: obj.misc?.trialPeriodDetail ?? "",
      specialNotes: obj.misc?.specialNotes ?? "",
      selectionFlow: obj.misc?.selectionFlow ?? "",
      salaryClosingDate: obj.misc?.salaryClosingDate ?? "",
      salaryPaymentDate: obj.misc?.salaryPaymentDate ?? "",
      joiningDate: normalizeDate(obj.misc?.joiningDate),
      interviewDate: normalizeDate(obj.misc?.interviewDate),
    },
  };
}
