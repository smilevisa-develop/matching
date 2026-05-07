/**
 * 2 つの ParsedJobSheet を「primary 優先 / 空フィールドのみ secondary で埋める」形でマージする。
 *
 * primary: ルールベース + セクション別 Gemini の結果 (高精度だが空きが多いことも)
 * secondary: ページ全文を 1 度 Gemini に投げて返ってきた結果 (低精度だが網羅的)
 */

import type { ParsedJobSheet } from "@/lib/job-sheet/types";

const isEmpty = (v: unknown): boolean => {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  return false;
};

const fillStringIfEmpty = (a: string, b: string | undefined): string =>
  isEmpty(a) ? b ?? "" : a;
const fillNullIfEmpty = <T>(a: T | null, b: T | null | undefined): T | null =>
  a !== null ? a : b ?? null;

export function mergeParsedJobSheets(
  primary: ParsedJobSheet,
  secondary: Partial<ParsedJobSheet>
): ParsedJobSheet {
  const out: ParsedJobSheet = JSON.parse(JSON.stringify(primary));

  // top-level
  out.jobCategory = fillStringIfEmpty(out.jobCategory, secondary.jobCategory);
  out.caseNumber = fillStringIfEmpty(out.caseNumber, secondary.caseNumber);
  out.updatedDate = fillStringIfEmpty(out.updatedDate, secondary.updatedDate);

  if (secondary.company) {
    out.company.name = fillStringIfEmpty(out.company.name, secondary.company.name);
    out.company.representative = fillStringIfEmpty(
      out.company.representative,
      secondary.company.representative
    );
    out.company.address = fillStringIfEmpty(out.company.address, secondary.company.address);
    out.company.tel = fillStringIfEmpty(out.company.tel, secondary.company.tel);
    out.company.fax = fillStringIfEmpty(out.company.fax, secondary.company.fax);
    out.company.businessDescription = fillStringIfEmpty(
      out.company.businessDescription,
      secondary.company.businessDescription
    );
  }
  if (secondary.job) {
    for (const key of Object.keys(out.job) as (keyof ParsedJobSheet["job"])[]) {
      out.job[key] = fillStringIfEmpty(out.job[key], secondary.job[key]);
    }
  }
  if (secondary.employment) {
    for (const key of Object.keys(out.employment) as (keyof ParsedJobSheet["employment"])[]) {
      out.employment[key] = fillStringIfEmpty(out.employment[key], secondary.employment[key]);
    }
  }
  if (secondary.workingHours) {
    out.workingHours.overtimeAvailable = fillNullIfEmpty(
      out.workingHours.overtimeAvailable,
      secondary.workingHours.overtimeAvailable ?? null
    );
    out.workingHours.averageMonthlyOvertimeHours = fillNullIfEmpty(
      out.workingHours.averageMonthlyOvertimeHours,
      secondary.workingHours.averageMonthlyOvertimeHours ?? null
    );
    out.workingHours.fixedOvertimeHours = fillNullIfEmpty(
      out.workingHours.fixedOvertimeHours,
      secondary.workingHours.fixedOvertimeHours ?? null
    );
    out.workingHours.annualHolidays = fillNullIfEmpty(
      out.workingHours.annualHolidays,
      secondary.workingHours.annualHolidays ?? null
    );
    out.workingHours.annualWorkingHours = fillNullIfEmpty(
      out.workingHours.annualWorkingHours,
      secondary.workingHours.annualWorkingHours ?? null
    );
    if (out.workingHours.shifts.length === 0 && secondary.workingHours.shifts) {
      out.workingHours.shifts = secondary.workingHours.shifts;
    }
  }
  if (secondary.salary) {
    out.salary.monthlyGross = fillNullIfEmpty(
      out.salary.monthlyGross,
      secondary.salary.monthlyGross ?? null
    );
    out.salary.baseSalary = fillNullIfEmpty(
      out.salary.baseSalary,
      secondary.salary.baseSalary ?? null
    );
    out.salary.salaryCalculationMethod = fillStringIfEmpty(
      out.salary.salaryCalculationMethod,
      secondary.salary.salaryCalculationMethod
    );
    if (out.salary.allowances.length === 0 && secondary.salary.allowances) {
      out.salary.allowances = secondary.salary.allowances;
    }
    if (secondary.salary.bonus) {
      out.salary.bonus.exists = fillNullIfEmpty(
        out.salary.bonus.exists,
        secondary.salary.bonus.exists ?? null
      );
      out.salary.bonus.amount = fillNullIfEmpty(
        out.salary.bonus.amount,
        secondary.salary.bonus.amount ?? null
      );
      out.salary.bonus.frequency = fillStringIfEmpty(
        out.salary.bonus.frequency,
        secondary.salary.bonus.frequency
      );
      out.salary.bonus.note = fillStringIfEmpty(out.salary.bonus.note, secondary.salary.bonus.note);
    }
  }
  if (secondary.deductions) {
    for (const key of Object.keys(out.deductions) as (keyof ParsedJobSheet["deductions"])[]) {
      out.deductions[key] = fillNullIfEmpty(out.deductions[key], secondary.deductions[key] ?? null);
    }
  }
  if (secondary.housing) {
    out.housing.dormitoryAvailable = fillNullIfEmpty(
      out.housing.dormitoryAvailable,
      secondary.housing.dormitoryAvailable ?? null
    );
    out.housing.dormitoryCost = fillNullIfEmpty(
      out.housing.dormitoryCost,
      secondary.housing.dormitoryCost ?? null
    );
    out.housing.maxPeoplePerRoom = fillNullIfEmpty(
      out.housing.maxPeoplePerRoom,
      secondary.housing.maxPeoplePerRoom ?? null
    );
    out.housing.sharedRoomsAvailable = fillNullIfEmpty(
      out.housing.sharedRoomsAvailable,
      secondary.housing.sharedRoomsAvailable ?? null
    );
    if (out.housing.equipment.length === 0 && secondary.housing.equipment) {
      out.housing.equipment = secondary.housing.equipment;
    }
    out.housing.commuteMethod = fillStringIfEmpty(
      out.housing.commuteMethod,
      secondary.housing.commuteMethod
    );
    out.housing.commuteMinutesFromHome = fillNullIfEmpty(
      out.housing.commuteMinutesFromHome,
      secondary.housing.commuteMinutesFromHome ?? null
    );
  }
  if (secondary.benefits) {
    for (const key of Object.keys(out.benefits) as (keyof ParsedJobSheet["benefits"])[]) {
      out.benefits[key] = fillStringIfEmpty(out.benefits[key], secondary.benefits[key]);
    }
  }
  if (secondary.misc) {
    out.misc.trialPeriodExists = fillNullIfEmpty(
      out.misc.trialPeriodExists,
      secondary.misc.trialPeriodExists ?? null
    );
    out.misc.trialPeriodDetail = fillStringIfEmpty(
      out.misc.trialPeriodDetail,
      secondary.misc.trialPeriodDetail
    );
    out.misc.specialNotes = fillStringIfEmpty(out.misc.specialNotes, secondary.misc.specialNotes);
    out.misc.selectionFlow = fillStringIfEmpty(out.misc.selectionFlow, secondary.misc.selectionFlow);
    out.misc.salaryClosingDate = fillStringIfEmpty(
      out.misc.salaryClosingDate,
      secondary.misc.salaryClosingDate
    );
    out.misc.salaryPaymentDate = fillStringIfEmpty(
      out.misc.salaryPaymentDate,
      secondary.misc.salaryPaymentDate
    );
    out.misc.joiningDate = fillStringIfEmpty(out.misc.joiningDate, secondary.misc.joiningDate);
    out.misc.interviewDate = fillStringIfEmpty(out.misc.interviewDate, secondary.misc.interviewDate);
  }
  return out;
}
