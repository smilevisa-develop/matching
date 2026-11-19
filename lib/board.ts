/**
 * 案件ボード (パートナー向けの公開ページ /board) の共通処理。
 *
 * - パートナーは専用リンク /board/enter/{token} から入る。鍵は cookie に入れて以後の画面で使う。
 *   見られるのは boardEnabled (登録済み = 許可番号と提携契約を確認済み) のパートナーだけ。
 * - 会社名・住所は出さない。出すのは Deal の board* 項目と、最新の求人票の条件だけ。
 * - 推薦の上限: パートナー 1 社あたり boardPerPartnerLimit 人、案件全体で boardTotalLimit 人
 *   (null なら募集人数の 3 倍、募集人数が 0 なら 10 人)。上限に達すると「満枠」になり推薦を受け付けない。
 */

import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getCurrentAccount } from "@/lib/auth";
import { publicUrl } from "@/lib/public-url";

export const BOARD_COOKIE = "board_partner";
export const BOARD_COOKIE_MAX_AGE = 60 * 60 * 24 * 90;

export { BOARD_REC_STATUSES, BOARD_REC_INACTIVE, BOARD_REC_STATUS_EN } from "@/lib/board-labels";

export type BoardPartner = {
  id: number;
  name: string;
  introducibleFields: string | null;
  introducibleNationalities: string | null;
};

/** cookie の鍵から、ボードを見られるパートナーを引く。見られなければ null */
export async function getBoardPartner(): Promise<BoardPartner | null> {
  const store = await cookies();
  const token = store.get(BOARD_COOKIE)?.value;
  if (!token || token.length < 16) return null;
  const partner = await prisma.partner.findUnique({
    where: { boardToken: token },
    select: { id: true, name: true, boardEnabled: true, introducibleFields: true, introducibleNationalities: true },
  });
  if (!partner || !partner.boardEnabled) return null;
  return {
    id: partner.id,
    name: partner.name,
    introducibleFields: partner.introducibleFields,
    introducibleNationalities: partner.introducibleNationalities,
  };
}

/**
 * 画面を見ている人: 登録済みパートナー、または社員のプレビュー (推薦・質問はできない)。
 * どちらでもなければ null。
 */
export async function getBoardViewer(): Promise<(BoardPartner & { preview: boolean }) | null> {
  const partner = await getBoardPartner();
  if (partner) return { ...partner, preview: false };
  const staff = await getCurrentAccount();
  if (staff) {
    return { id: 0, name: `社員のプレビュー（${staff.name}）`, introducibleFields: null, introducibleNationalities: null, preview: true };
  }
  return null;
}

export function boardEnterUrl(token: string): string {
  return publicUrl(`/board/enter/${token}`);
}

/** 案件全体の推薦の上限 */
export function totalLimitOf(deal: { boardTotalLimit: number | null; requiredCount: number }): number {
  if (deal.boardTotalLimit && deal.boardTotalLimit > 0) return deal.boardTotalLimit;
  return deal.requiredCount > 0 ? deal.requiredCount * 3 : 10;
}

/** 必須条件 (Json) を文字列の配列にする */
export function requirementsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => (typeof v === "string" ? v.trim() : "")).filter(Boolean);
}

/** 公開に必要な項目 (空だと公開できない)。職業安定法の明示事項を含む */
export function missingForOpen(deal: {
  boardTitle: string | null;
  boardArea: string | null;
  boardJobChangeScope: string | null;
  boardPlaceChangeScope: string | null;
  boardRenewalLimit: string | null;
}): string[] {
  const missing: string[] = [];
  if (!deal.boardTitle?.trim()) missing.push("ボードに出す案件名");
  if (!deal.boardArea?.trim()) missing.push("勤務地の地域");
  if (!deal.boardJobChangeScope?.trim()) missing.push("業務の変更の範囲");
  if (!deal.boardPlaceChangeScope?.trim()) missing.push("就業場所の変更の範囲");
  if (!deal.boardRenewalLimit?.trim()) missing.push("契約更新の上限");
  return missing;
}

/** 締切日を過ぎたか */
export function isPastDeadline(deadline: Date | null): boolean {
  if (!deadline) return false;
  const end = new Date(deadline);
  end.setHours(23, 59, 59, 999);
  return end.getTime() < Date.now();
}

/**
 * 求人票から、ボードに出してよい条件だけを取り出す (会社名・住所・最寄り駅は出さない)。
 * 値が空の項目は出さない。
 */
export const BOARD_CONDITION_FIELDS: { key: string; ja: string; en: string; group: string }[] = [
  { key: "jobDescription", ja: "仕事内容", en: "Job description", group: "仕事 / Job" },
  { key: "headcount", ja: "募集人数", en: "Openings", group: "仕事 / Job" },
  { key: "gender", ja: "性別", en: "Gender", group: "仕事 / Job" },
  { key: "nationality", ja: "国籍", en: "Nationality", group: "仕事 / Job" },
  { key: "monthlyGross", ja: "月の総支給", en: "Monthly gross pay", group: "給与 / Pay" },
  { key: "basicSalary", ja: "基本給", en: "Base salary", group: "給与 / Pay" },
  { key: "salaryCalcMethod", ja: "計算方法", en: "Pay basis", group: "給与 / Pay" },
  { key: "housingAllowance", ja: "住宅手当", en: "Housing allowance", group: "給与 / Pay" },
  { key: "nightShiftAllowance", ja: "夜勤手当", en: "Night allowance", group: "給与 / Pay" },
  { key: "commuteAllowance", ja: "通勤手当", en: "Commute allowance", group: "給与 / Pay" },
  { key: "fixedOvertimePay", ja: "固定残業代", en: "Fixed overtime pay", group: "給与 / Pay" },
  { key: "salaryIncrease", ja: "昇給", en: "Raises", group: "給与 / Pay" },
  { key: "bonus", ja: "賞与", en: "Bonus", group: "給与 / Pay" },
  { key: "monthlyDeduction", ja: "月の控除の目安", en: "Monthly deductions", group: "控除 / Deductions" },
  { key: "socialInsurance", ja: "社会保険", en: "Social insurance", group: "控除 / Deductions" },
  { key: "incomeTax", ja: "所得税", en: "Income tax", group: "控除 / Deductions" },
  { key: "residentTax", ja: "住民税", en: "Resident tax", group: "控除 / Deductions" },
  { key: "otherDeductions", ja: "その他の控除", en: "Other deductions", group: "控除 / Deductions" },
  { key: "workTime", ja: "勤務時間", en: "Working hours", group: "勤務 / Work" },
  { key: "avgMonthlyOvertime", ja: "月の平均残業", en: "Average overtime", group: "勤務 / Work" },
  { key: "holidays", ja: "休日", en: "Days off", group: "勤務 / Work" },
  { key: "holidayCategory", ja: "休日の区分", en: "Holiday type", group: "勤務 / Work" },
  { key: "trialPeriodDetails", ja: "試用期間", en: "Probation", group: "勤務 / Work" },
  { key: "dormProvision", ja: "寮", en: "Dormitory", group: "住まい / Housing" },
  { key: "dormAmount", ja: "寮費", en: "Dorm fee", group: "住まい / Housing" },
  { key: "dormOccupants", ja: "寮の人数", en: "People per dorm", group: "住まい / Housing" },
  { key: "bedroomShared", ja: "寝室の共有", en: "Shared bedroom", group: "住まい / Housing" },
  { key: "dormCommuteTime", ja: "寮からの通勤", en: "Commute from dorm", group: "住まい / Housing" },
  { key: "utilitiesAmount", ja: "水道光熱費", en: "Utilities", group: "住まい / Housing" },
  { key: "mealProvision", ja: "食事", en: "Meals", group: "住まい / Housing" },
  { key: "movingSupportDetails", ja: "引越の補助", en: "Moving support", group: "住まい / Housing" },
  { key: "japaneseLevel", ja: "日本語", en: "Japanese level", group: "応募条件 / Requirements" },
  { key: "experienceYears", ja: "経験", en: "Experience", group: "応募条件 / Requirements" },
  { key: "requiredQualifications", ja: "必要な資格", en: "Qualifications", group: "応募条件 / Requirements" },
  { key: "overseasApplication", ja: "海外からの応募", en: "Applicants abroad", group: "応募条件 / Requirements" },
  { key: "foreignWorkers", ja: "外国人の同僚", en: "Foreign coworkers", group: "応募条件 / Requirements" },
  { key: "selectionFlow", ja: "選考の流れ", en: "Selection steps", group: "選考 / Selection" },
  { key: "preferredInterviewDate", ja: "面接の時期", en: "Interview timing", group: "選考 / Selection" },
  { key: "preferredEntryDate", ja: "入社・入国の時期", en: "Start / entry timing", group: "選考 / Selection" },
];

export type BoardCondition = { group: string; ja: string; en: string; value: string };

/** 求人票の行から、ボードに出す条件の一覧を作る */
export function conditionsFromPosting(posting: Record<string, unknown> | null): BoardCondition[] {
  if (!posting) return [];
  const str = (k: string) => {
    const v = posting[k];
    return typeof v === "string" ? v.trim() : "";
  };
  const out: BoardCondition[] = [];
  for (const f of BOARD_CONDITION_FIELDS) {
    let value = "";
    if (f.key === "workTime") {
      const a = [str("workTime1Start"), str("workTime1End")].filter(Boolean).join("〜");
      const b = [str("workTime2Start"), str("workTime2End")].filter(Boolean).join("〜");
      value = [a, b].filter(Boolean).join(" / ");
    } else {
      value = str(f.key);
    }
    if (value) out.push({ group: f.group, ja: f.ja, en: f.en, value });
  }
  return out;
}

/** パートナーの紹介できる分野に、案件の分野が入っているか (「条件が合う」の目印) */
export function fieldMatches(partnerFields: string | null, dealField: string | null): boolean {
  if (!partnerFields || !dealField) return false;
  const fields = partnerFields.split(/[,、]/).map((s) => s.trim()).filter(Boolean);
  return fields.some((f) => dealField.includes(f) || f.includes(dealField));
}

/** 社員への通知 (Slack の Incoming Webhook。未設定なら何もしない) */
export async function notifyStaff(text: string): Promise<void> {
  const hook = process.env.BOARD_SLACK_WEBHOOK_URL?.trim();
  if (!hook) return;
  await fetch(hook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  }).catch(() => undefined);
}

/** 日付を YYYY/MM/DD に */
export function ymd(d: Date | null | undefined): string {
  if (!d) return "";
  const x = new Date(d);
  return `${x.getFullYear()}/${String(x.getMonth() + 1).padStart(2, "0")}/${String(x.getDate()).padStart(2, "0")}`;
}
