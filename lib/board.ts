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
import { BOARD_LANG_COOKIE, isBoardLang, langForCountry, type BoardLang } from "@/lib/board-i18n";

export const BOARD_COOKIE = "board_partner";
export const BOARD_COOKIE_MAX_AGE = 60 * 60 * 24 * 90;

export { BOARD_REC_STATUSES, BOARD_REC_INACTIVE, BOARD_REC_STATUS_EN } from "@/lib/board-labels";

export type BoardPartner = {
  id: number;
  name: string;
  introducibleFields: string | null;
  introducibleNationalities: string | null;
  country: string | null;
};

/** cookie の鍵から、ボードを見られるパートナーを引く。見られなければ null */
export async function getBoardPartner(): Promise<BoardPartner | null> {
  const store = await cookies();
  const token = store.get(BOARD_COOKIE)?.value;
  if (!token || token.length < 16) return null;
  const partner = await prisma.partner.findUnique({
    where: { boardToken: token },
    select: { id: true, name: true, boardEnabled: true, introducibleFields: true, introducibleNationalities: true, country: true },
  });
  if (!partner || !partner.boardEnabled) return null;
  return {
    id: partner.id,
    name: partner.name,
    introducibleFields: partner.introducibleFields,
    introducibleNationalities: partner.introducibleNationalities,
    country: partner.country,
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
    return {
      id: 0,
      name: `社員のプレビュー（${staff.name}）`,
      introducibleFields: null,
      introducibleNationalities: null,
      country: "日本",
      preview: true,
    };
  }
  return null;
}

/** 画面の言語: 切り替えで選んだもの (cookie)、なければパートナーの国から */
export async function getBoardLang(viewer: { country: string | null } | null): Promise<BoardLang> {
  const store = await cookies();
  const chosen = store.get(BOARD_LANG_COOKIE)?.value;
  if (isBoardLang(chosen)) return chosen;
  return langForCountry(viewer?.country);
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
 * 値が空の項目は出さない。見出しの言葉は lib/board-i18n.ts の BOARD_CONDITION_LABELS / BOARD_CONDITION_GROUPS。
 */
export const BOARD_CONDITION_FIELDS: { key: string; group: string }[] = [
  { key: "jobDescription", group: "job" },
  { key: "headcount", group: "job" },
  { key: "gender", group: "job" },
  { key: "nationality", group: "job" },
  { key: "monthlyGross", group: "pay" },
  { key: "basicSalary", group: "pay" },
  { key: "salaryCalcMethod", group: "pay" },
  { key: "housingAllowance", group: "pay" },
  { key: "nightShiftAllowance", group: "pay" },
  { key: "commuteAllowance", group: "pay" },
  { key: "fixedOvertimePay", group: "pay" },
  { key: "salaryIncrease", group: "pay" },
  { key: "bonus", group: "pay" },
  { key: "monthlyDeduction", group: "deductions" },
  { key: "socialInsurance", group: "deductions" },
  { key: "incomeTax", group: "deductions" },
  { key: "residentTax", group: "deductions" },
  { key: "otherDeductions", group: "deductions" },
  { key: "workTime", group: "work" },
  { key: "avgMonthlyOvertime", group: "work" },
  { key: "holidays", group: "work" },
  { key: "holidayCategory", group: "work" },
  { key: "trialPeriodDetails", group: "work" },
  { key: "dormProvision", group: "housing" },
  { key: "dormAmount", group: "housing" },
  { key: "dormOccupants", group: "housing" },
  { key: "bedroomShared", group: "housing" },
  { key: "dormCommuteTime", group: "housing" },
  { key: "utilitiesAmount", group: "housing" },
  { key: "mealProvision", group: "housing" },
  { key: "movingSupportDetails", group: "housing" },
  { key: "japaneseLevel", group: "requirements" },
  { key: "experienceYears", group: "requirements" },
  { key: "requiredQualifications", group: "requirements" },
  { key: "overseasApplication", group: "requirements" },
  { key: "foreignWorkers", group: "requirements" },
  { key: "selectionFlow", group: "selection" },
  { key: "preferredInterviewDate", group: "selection" },
  { key: "preferredEntryDate", group: "selection" },
];

export type BoardCondition = { key: string; group: string; value: string };

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
    if (value) out.push({ key: f.key, group: f.group, value });
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
