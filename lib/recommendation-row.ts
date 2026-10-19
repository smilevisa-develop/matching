import { calculateAge } from "@/lib/candidate-profile";
import {
  RECOMMENDATION_COLUMN_OPTIONS,
  type RecommendationColumnKey,
} from "@/lib/recommendation-columns";
import { normalizeToIsoDate, isBrokenExtendedIsoDate } from "@/lib/date-normalize";

/**
 * DB に万一 broken な "+0YYYYY-XX" 形式が残っていても、CSV 出力時に
 * 防衛的に正規化する。バックフィルスクリプトの取りこぼし救済。
 */
function safeDateOut(value: string | null | undefined): string {
  if (!value) return "";
  if (isBrokenExtendedIsoDate(value)) {
    return normalizeToIsoDate(value) ?? "";
  }
  return value;
}

type CandidateInput = {
  stage: string;
  createdAt: Date;
  person: {
    id: number;
    name: string;
    nationality: string;
    residenceStatus: string;
    email: string | null;
    driveFolderUrl: string | null;
    onboarding: {
      englishName: string | null;
      birthDate: string | null;
      address: string | null;
      phoneNumber: string | null;
    } | null;
    resumeProfile: {
      gender: string | null;
      visaExpiryDate: string | null;
      visaType: string | null;
      /** 特定技能として働き始めた日 (YYYY-MM-DD)。通算期間の計算に使う */
      sswStartDate?: string | null;
      retirementReason?: string | null;
      traineeExperience: string | null;
      japaneseLevel: string | null;
      japaneseLevelDate: string | null;
      licenseName: string | null;
      preferenceNote: string | null;
      resumeFileUrl: string | null;
    } | null;
    resumeDocuments?: { documentUrl: string | null }[];
    partner?: { name: string } | null;
  };
};

/**
 * 特定技能の通算期間 (開始日から今日まで) を「N年Mか月」で返す。
 * 特定技能1号は通算 5 年までなので、企業は残り期間を知りたい。開始日が未入力なら空欄。
 */
export function formatSswDuration(startDate: string | null | undefined, now: Date = new Date()): string {
  if (!startDate) return "";
  const m = startDate.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
  if (!m) return "";
  const start = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3] ?? "1"));
  if (Number.isNaN(start.getTime()) || start > now) return "";
  let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) months -= 1;
  if (months < 0) return "";
  const y = Math.floor(months / 12);
  const mo = months % 12;
  return `${y ? `${y}年` : ""}${mo || !y ? `${mo}か月` : ""}`;
}

/**
 * 実習経験の記録を「有 / 無」だけに丸める (推薦リストは企業に渡すため、中身は出さない)。
 *
 * この項目には AI 取込や本人入力で色々な書き方が入っている:
 *   「はい」「いいえ」「有」「技能実習1号ロ」「◯◯株式会社で3年」など。
 * 否定を表す言い回しなら「無」、それ以外の記入があれば「有」、
 * 未記入は空欄のままにする (記録が無いだけなのに「無」と断定しないため)。
 */
function toTraineeYesNo(raw: string | null | undefined): string {
  const value = (raw ?? "").trim();
  if (!value) return "";
  const negative = /^(いいえ|無|なし|無し|ない|未経験|経験なし|経験無し|no|none|n\/a|-|ー|×)$/i;
  if (negative.test(value)) return "無";
  return "有";
}

export function getRecommendationColumnLabel(key: RecommendationColumnKey): string {
  return RECOMMENDATION_COLUMN_OPTIONS.find((c) => c.key === key)?.label ?? key;
}

export function buildRecommendationCellValue(
  candidate: CandidateInput,
  key: RecommendationColumnKey
): string {
  const p = candidate.person;
  const onb = p.onboarding;
  const resume = p.resumeProfile;
  const latestResume = p.resumeDocuments?.[0] ?? null;

  switch (key) {
    case "addedAt":
      return candidate.createdAt.toISOString().slice(0, 10);
    case "englishName":
      return onb?.englishName ?? "";
    case "name":
      return p.name;
    case "stage":
      return candidate.stage;
    case "gender":
      return resume?.gender ?? "";
    case "age":
      return calculateAge(safeDateOut(onb?.birthDate ?? null) || null) || "";
    case "nationality":
      return p.nationality;
    case "residenceStatus":
      return p.residenceStatus;
    case "address":
      return onb?.address ?? "";
    case "birthDate":
      return safeDateOut(onb?.birthDate ?? null);
    case "visaExpiryDate":
      return safeDateOut(resume?.visaExpiryDate ?? null);
    case "sswYears":
      // 開始日 (候補者詳細 → 在留資格・免許 → 特定技能の開始日) から計算。未入力なら空欄
      return formatSswDuration(resume?.sswStartDate);
    case "retirementReason":
      return resume?.retirementReason ?? "";
    case "traineeExperience":
      return toTraineeYesNo(resume?.traineeExperience);
    case "japaneseLevel":
      return resume?.japaneseLevel ?? "";
    case "japaneseLevelDate":
      return safeDateOut(resume?.japaneseLevelDate ?? null);
    case "licenseName":
      return resume?.licenseName ?? "";
    case "preferenceNote":
      return resume?.preferenceNote ?? "";
    case "phoneNumber":
      return onb?.phoneNumber ?? "";
    case "email":
      return p.email ?? "";
    case "partner":
      return p.partner?.name ?? "";
    case "resumeUrl":
      // 履歴書 URL の優先順位:
      //   1. ResumeProfile.resumeFileUrl (bulk-add でアップした履歴書ファイル直接 URL)
      //   2. ResumeDocument.documentUrl (Docs テンプレ展開で作られた履歴書)
      //   3. Drive 候補者フォルダ URL (フォールバック)
      return resume?.resumeFileUrl || latestResume?.documentUrl || p.driveFolderUrl || "";
    case "driveFolderUrl":
      return p.driveFolderUrl ?? "";
    default:
      return "";
  }
}
