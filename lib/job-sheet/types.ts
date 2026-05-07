/**
 * 求人票パイプラインの型定義。
 * 出力する最終 JSON はユーザー要望通りの形 (RFC スキーマ)。
 */

export type JobSheetShift = {
  label: string;
  timeRange: string;
  breakMinutes: number | null;
};

export type JobSheetAllowance = {
  name: string;
  amount: number | null;
  unit: string;
  calculationMethod: string;
};

export type JobSheetBonus = {
  exists: boolean | null;
  amount: number | null;
  frequency: string;
  note: string;
};

export type JobSheetCompany = {
  name: string;
  representative: string;
  address: string;
  tel: string;
  fax: string;
  businessDescription: string;
};

export type JobSheetJob = {
  acceptanceOccupation: string;
  workLocation: string;
  jobDescription: string;
  recruitmentCount: string;
  ageRequirement: string;
  genderRequirement: string;
  nationalityRequirement: string;
  japaneseLevelRequirement: string;
  experienceRequirement: string;
  otherRequirements: string;
};

export type JobSheetEmployment = {
  employmentType: string;
  employmentPeriod: string;
  visaType: string;
  field: string;
  nearestStation: string;
  workplace: string;
  country: string;
};

export type JobSheetWorkingHours = {
  shifts: JobSheetShift[];
  overtimeAvailable: boolean | null;
  averageMonthlyOvertimeHours: number | null;
  fixedOvertimeHours: number | null;
  annualHolidays: number | null;
  annualWorkingHours: number | null;
};

export type JobSheetSalary = {
  monthlyGross: number | null;
  baseSalary: number | null;
  salaryCalculationMethod: string;
  allowances: JobSheetAllowance[];
  bonus: JobSheetBonus;
};

export type JobSheetDeductions = {
  monthlyDeductionTotal: number | null;
  healthInsurance: number | null;
  pension: number | null;
  employmentInsurance: number | null;
  incomeTax: number | null;
  residentTax: number | null;
  other: number | null;
  housingCost: number | null;
  foodCost: number | null;
  utilities: number | null;
  waterCost: number | null;
  wifiCost: number | null;
};

export type JobSheetHousing = {
  dormitoryAvailable: boolean | null;
  dormitoryCost: number | null;
  maxPeoplePerRoom: number | null;
  sharedRoomsAvailable: boolean | null;
  equipment: string[];
  commuteMethod: string;
  commuteMinutesFromHome: number | null;
};

export type JobSheetBenefits = {
  socialInsurance: string;
  payRaise: string;
  holidays: string;
  paidLeave: string;
  mealSupport: string;
  otherWelfare: string;
};

export type JobSheetMisc = {
  trialPeriodExists: boolean | null;
  trialPeriodDetail: string;
  specialNotes: string;
  selectionFlow: string;
  salaryClosingDate: string;
  salaryPaymentDate: string;
  joiningDate: string;
  interviewDate: string;
};

export type JobSheetConfidence = {
  overall: number; // 0..1
  fields: Record<string, number>;
};

export type ParsedJobSheet = {
  sourceFileName: string;
  pageNumber: number;
  jobCategory: string;
  caseNumber: string;
  updatedDate: string;
  company: JobSheetCompany;
  job: JobSheetJob;
  employment: JobSheetEmployment;
  workingHours: JobSheetWorkingHours;
  salary: JobSheetSalary;
  deductions: JobSheetDeductions;
  housing: JobSheetHousing;
  benefits: JobSheetBenefits;
  misc: JobSheetMisc;
  rawText: string;
  confidence: JobSheetConfidence;
};

export function emptyParsedJobSheet(sourceFileName: string, pageNumber: number): ParsedJobSheet {
  return {
    sourceFileName,
    pageNumber,
    jobCategory: "",
    caseNumber: "",
    updatedDate: "",
    company: { name: "", representative: "", address: "", tel: "", fax: "", businessDescription: "" },
    job: {
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
    },
    employment: {
      employmentType: "",
      employmentPeriod: "",
      visaType: "",
      field: "",
      nearestStation: "",
      workplace: "",
      country: "",
    },
    workingHours: {
      shifts: [],
      overtimeAvailable: null,
      averageMonthlyOvertimeHours: null,
      fixedOvertimeHours: null,
      annualHolidays: null,
      annualWorkingHours: null,
    },
    salary: {
      monthlyGross: null,
      baseSalary: null,
      salaryCalculationMethod: "",
      allowances: [],
      bonus: { exists: null, amount: null, frequency: "", note: "" },
    },
    deductions: {
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
    },
    housing: {
      dormitoryAvailable: null,
      dormitoryCost: null,
      maxPeoplePerRoom: null,
      sharedRoomsAvailable: null,
      equipment: [],
      commuteMethod: "",
      commuteMinutesFromHome: null,
    },
    benefits: {
      socialInsurance: "",
      payRaise: "",
      holidays: "",
      paidLeave: "",
      mealSupport: "",
      otherWelfare: "",
    },
    misc: {
      trialPeriodExists: null,
      trialPeriodDetail: "",
      specialNotes: "",
      selectionFlow: "",
      salaryClosingDate: "",
      salaryPaymentDate: "",
      joiningDate: "",
      interviewDate: "",
    },
    rawText: "",
    confidence: { overall: 0, fields: {} },
  };
}

export type SectionKey =
  | "company"
  | "job"
  | "employment"
  | "salary"
  | "workingHours"
  | "housing"
  | "benefits"
  | "misc";

export type SectionChunk = {
  section: SectionKey;
  /** このセクションに属すると判定された生テキスト */
  text: string;
  /** 含まれていたラベル群 (デバッグ用) */
  labels: string[];
};
