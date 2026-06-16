/**
 * 編集済みの候補者配列を一括で Person + Onboarding + ResumeProfile として作成。
 *
 * 入力: { candidates: BulkCandidate[] }
 * 出力: { ok, created: [{ id, name }], failed: [{ index, name, error }] }
 *
 * 1 件失敗が全体ロールバックにはならない (per-item try-catch)。
 * 失敗分は failed 配列で報告して、成功分はそのまま DB に残す方針。
 */

import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";
import { NATIONALITIES, RESIDENCE_STATUSES, CHANNELS } from "@/lib/candidate-profile";

type BulkCandidate = {
  // Person 直下
  name: string;
  englishName?: string | null;
  nationality?: string | null;
  residenceStatus?: string | null;
  channel?: string | null;
  email?: string | null;
  phoneNumber?: string | null;
  partnerId?: number | null;
  photoUrl?: string | null;

  // PersonOnboarding
  birthDate?: string | null;
  postalCode?: string | null;
  address?: string | null;

  // ResumeProfile
  gender?: string | null;
  visaExpiryDate?: string | null;
  japaneseLevel?: string | null;
  japaneseLevelDate?: string | null;
  licenseName?: string | null;
  licenseExpiryDate?: string | null;
  otherQualificationName?: string | null;
  otherQualificationExpiryDate?: string | null;
  traineeExperience?: string | null;
  spouseStatus?: string | null;
  childrenCount?: string | null;
  highSchoolName?: string | null;
  highSchoolStartDate?: string | null;
  highSchoolEndDate?: string | null;
  universityName?: string | null;
  universityStartDate?: string | null;
  universityEndDate?: string | null;
  motivation?: string | null;
  selfIntroduction?: string | null;
  japanPurpose?: string | null;
  currentJob?: string | null;
  retirementReason?: string | null;
  preferenceNote?: string | null;
  workExperiences?: {
    companyName?: string;
    startDate?: string;
    endDate?: string;
    reason?: string;
  }[];
};

function s(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  return t.length === 0 ? null : t;
}

function normalizeNationality(v: string | null | undefined): string {
  const t = s(v);
  if (!t) return "その他";
  return (NATIONALITIES as readonly string[]).includes(t) ? t : "その他";
}

function normalizeResidenceStatus(v: string | null | undefined): string {
  const t = s(v);
  if (!t) return "不明";
  return (RESIDENCE_STATUSES as readonly string[]).includes(t) ? t : "不明";
}

function normalizeChannel(v: string | null | undefined): string {
  const t = s(v);
  if (!t) return "未設定";
  return CHANNELS.some((c) => c.value === t) ? t : "未設定";
}

export async function POST(req: Request) {
  try {
    await requireApiAccount();
    const body = await req.json();
    const candidates = body?.candidates as BulkCandidate[] | undefined;
    if (!Array.isArray(candidates) || candidates.length === 0) {
      return Response.json({ ok: false, error: "candidates 配列が必要です" }, { status: 400 });
    }
    if (candidates.length > 10) {
      return Response.json(
        { ok: false, error: "一度に登録できるのは最大 10 件までです" },
        { status: 400 }
      );
    }

    const created: { id: number; name: string }[] = [];
    const failed: { index: number; name: string; error: string }[] = [];

    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      const name = s(c.name);
      if (!name) {
        failed.push({ index: i, name: "(名前なし)", error: "name が必須です" });
        continue;
      }
      try {
        const person = await prisma.person.create({
          data: {
            name,
            photoUrl: s(c.photoUrl) || null,
            nationality: normalizeNationality(c.nationality),
            residenceStatus: normalizeResidenceStatus(c.residenceStatus),
            channel: normalizeChannel(c.channel),
            partnerId: typeof c.partnerId === "number" ? c.partnerId : null,
            email: s(c.email) || null,
            onboarding: {
              create: {
                englishName: s(c.englishName),
                birthDate: s(c.birthDate),
                phoneNumber: s(c.phoneNumber),
                postalCode: s(c.postalCode),
                address: s(c.address),
                status: "draft",
              },
            },
            resumeProfile: {
              create: {
                gender: s(c.gender),
                country: normalizeNationality(c.nationality),
                visaType: normalizeResidenceStatus(c.residenceStatus),
                visaExpiryDate: s(c.visaExpiryDate),
                japaneseLevel: s(c.japaneseLevel),
                japaneseLevelDate: s(c.japaneseLevelDate),
                licenseName: s(c.licenseName),
                licenseExpiryDate: s(c.licenseExpiryDate),
                otherQualificationName: s(c.otherQualificationName),
                otherQualificationExpiryDate: s(c.otherQualificationExpiryDate),
                traineeExperience: s(c.traineeExperience),
                spouseStatus: s(c.spouseStatus),
                childrenCount: s(c.childrenCount),
                highSchoolName: s(c.highSchoolName),
                highSchoolStartDate: s(c.highSchoolStartDate),
                highSchoolEndDate: s(c.highSchoolEndDate),
                universityName: s(c.universityName),
                universityStartDate: s(c.universityStartDate),
                universityEndDate: s(c.universityEndDate),
                motivation: s(c.motivation),
                selfIntroduction: s(c.selfIntroduction),
                japanPurpose: s(c.japanPurpose),
                currentJob: s(c.currentJob),
                retirementReason: s(c.retirementReason),
                preferenceNote: s(c.preferenceNote),
                workExperiences: Array.isArray(c.workExperiences) && c.workExperiences.length > 0 ? c.workExperiences : undefined,
              },
            },
          },
        });
        created.push({ id: person.id, name: person.name });
      } catch (e) {
        failed.push({
          index: i,
          name,
          error: e instanceof Error ? e.message : "error",
        });
      }
    }

    return Response.json({ ok: true, created, failed });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 }
    );
  }
}
