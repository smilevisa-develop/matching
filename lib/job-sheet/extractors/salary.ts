import { geminiExtractSection, type GeminiSectionDebug } from "@/lib/gemini";
import { normalizeYen } from "@/lib/job-sheet/normalize";
import type {
  JobSheetSalary,
  JobSheetDeductions,
  JobSheetAllowance,
  JobSheetBonus,
} from "@/lib/job-sheet/types";

const SALARY_SCHEMA = `{
  "monthlyGross": "月総支給額 (整数 円)",
  "baseSalary": "基本給 (整数 円)",
  "salaryCalculationMethod": "給与計算方法 (例: '時給', '月給', '日給月給')",
  "allowances": [
    {
      "name": "手当名 (例: 住宅手当 / 皆勤手当 / 通勤手当 / 深夜手当 / 固定残業代)",
      "amount": "金額 (整数 円。'実費支給' 等のテキストなら null)",
      "unit": "単位 (例: '円/月', '円/回'). amount が null でも文字列で返す",
      "calculationMethod": "計算方法 (例: '実費')"
    }
  ],
  "bonus": {
    "exists": "賞与の有無 true / false / null",
    "amount": "1 回あたり金額 (整数 円, 不明なら null)",
    "frequency": "支給頻度 (例: '年2回')",
    "note": "賞与に関する補足"
  }
}

注意:
- 1ヶ月の総支給額は monthlyGross に。基本給は baseSalary に分けること。
- 住宅費 / 食費 / 社会保険料など「控除側」は salary には入れない (deductions セクションへ)
- 賞与の支給頻度や条件は備考にも分散しがち。テキストにあるものだけ拾う。`;

const DEDUCTIONS_SCHEMA = `{
  "monthlyDeductionTotal": "月の控除合計 (整数 円)",
  "healthInsurance": "健康保険料",
  "pension": "厚生年金保険料",
  "employmentInsurance": "雇用保険料",
  "incomeTax": "所得税",
  "residentTax": "住民税",
  "other": "その他控除",
  "housingCost": "住宅費 / 寮費 (月額)",
  "foodCost": "食費 (月額)",
  "utilities": "光熱費 (月額)",
  "waterCost": "水道費 (月額)",
  "wifiCost": "WiFi 費 (月額)"
}

注意:
- 全て月額の数値 (整数 円) で返す。実費 / 不明は null。`;

export async function extractSalarySection(
  text: string
): Promise<{ data: JobSheetSalary; debug: GeminiSectionDebug }> {
  const fallback: JobSheetSalary = {
    monthlyGross: null,
    baseSalary: null,
    salaryCalculationMethod: "",
    allowances: [],
    bonus: { exists: null, amount: null, frequency: "", note: "" },
  };
  const { data, debug } = await geminiExtractSection<{
    monthlyGross?: string | number | null;
    baseSalary?: string | number | null;
    salaryCalculationMethod?: string;
    allowances?: { name?: string; amount?: string | number | null; unit?: string; calculationMethod?: string }[];
    bonus?: Partial<JobSheetBonus>;
  }>({
    sectionName: "salary",
    text,
    schemaDescription: SALARY_SCHEMA,
  });
  if (!data) return { data: fallback, debug };
  const allowances: JobSheetAllowance[] =
    (data.allowances ?? []).map((a) => ({
      name: a.name ?? "",
      amount: typeof a.amount === "number" ? a.amount : normalizeYen(typeof a.amount === "string" ? a.amount : null),
      unit: a.unit ?? "",
      calculationMethod: a.calculationMethod ?? "",
    })) ?? [];
  return {
    data: {
      monthlyGross:
        typeof data.monthlyGross === "number" ? data.monthlyGross : normalizeYen(data.monthlyGross as string | null),
      baseSalary:
        typeof data.baseSalary === "number" ? data.baseSalary : normalizeYen(data.baseSalary as string | null),
      salaryCalculationMethod: data.salaryCalculationMethod ?? "",
      allowances,
      bonus: {
        exists: data.bonus?.exists ?? null,
        amount:
          typeof data.bonus?.amount === "number"
            ? data.bonus!.amount!
            : normalizeYen(typeof data.bonus?.amount === "string" ? data.bonus!.amount! : null),
        frequency: data.bonus?.frequency ?? "",
        note: data.bonus?.note ?? "",
      },
    },
    debug,
  };
}

export async function extractDeductionsSection(
  text: string
): Promise<{ data: JobSheetDeductions; debug: GeminiSectionDebug }> {
  const fallback: JobSheetDeductions = {
    monthlyDeductionTotal: null,
    healthInsurance: null,
    pension: null,
    employmentInsurance: null,
    incomeTax: null,
    residentTax: null,
    other: null,
    housingCost: null,
    foodCost: null,
    utilities: null,
    waterCost: null,
    wifiCost: null,
  };
  const { data, debug } = await geminiExtractSection<Record<string, string | number | null>>({
    sectionName: "deductions",
    text,
    schemaDescription: DEDUCTIONS_SCHEMA,
  });
  if (!data) return { data: fallback, debug };
  const num = (key: string) => {
    const v = data[key];
    if (typeof v === "number") return v;
    if (typeof v === "string") return normalizeYen(v);
    return null;
  };
  return {
    data: {
      monthlyDeductionTotal: num("monthlyDeductionTotal"),
      healthInsurance: num("healthInsurance"),
      pension: num("pension"),
      employmentInsurance: num("employmentInsurance"),
      incomeTax: num("incomeTax"),
      residentTax: num("residentTax"),
      other: num("other"),
      housingCost: num("housingCost"),
      foodCost: num("foodCost"),
      utilities: num("utilities"),
      waterCost: num("waterCost"),
      wifiCost: num("wifiCost"),
    },
    debug,
  };
}
