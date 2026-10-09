import { cleanCompanyName } from "@/lib/candidate-profile";
import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";
import type { ExtractedCandidate } from "@/lib/ai-extract";

type Params = Promise<{ id: string }>;

function nonEmpty(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export async function POST(req: Request, { params }: { params: Params }) {
  try {
    await requireApiAccount();
    const { id } = await params;
    const personId = Number(id);
    const body = await req.json();
    const extracted: ExtractedCandidate = body?.extracted ?? {};

    const onboardingUpdate: Record<string, string | null | undefined> = {};
    const resumeUpdate: Record<string, unknown> = {};
    const personUpdate: Record<string, string | null | undefined> = {};

    // Person 直下
    if (nonEmpty(extracted.name)) personUpdate.name = extracted.name!;
    if (nonEmpty(extracted.nationality)) personUpdate.nationality = extracted.nationality!;
    if (nonEmpty(extracted.residenceStatus)) personUpdate.residenceStatus = extracted.residenceStatus!;

    // onboarding
    if (nonEmpty(extracted.englishName)) onboardingUpdate.englishName = extracted.englishName!;
    if (nonEmpty(extracted.birthDate)) onboardingUpdate.birthDate = extracted.birthDate!;
    if (nonEmpty(extracted.phoneNumber)) onboardingUpdate.phoneNumber = extracted.phoneNumber!;
    if (nonEmpty(extracted.postalCode)) onboardingUpdate.postalCode = extracted.postalCode!;
    if (nonEmpty(extracted.address)) onboardingUpdate.address = extracted.address!;
    if (nonEmpty(extracted.email)) personUpdate.email = extracted.email!;

    // resume profile
    if (nonEmpty(extracted.gender)) resumeUpdate.gender = extracted.gender!;
    if (nonEmpty(extracted.spouseStatus)) resumeUpdate.spouseStatus = extracted.spouseStatus!;
    if (nonEmpty(extracted.childrenCount)) resumeUpdate.childrenCount = extracted.childrenCount!;
    if (nonEmpty(extracted.visaExpiryDate)) resumeUpdate.visaExpiryDate = extracted.visaExpiryDate!;
    if (nonEmpty(extracted.japaneseLevel)) resumeUpdate.japaneseLevel = extracted.japaneseLevel!;
    if (nonEmpty(extracted.japaneseLevelDate)) resumeUpdate.japaneseLevelDate = extracted.japaneseLevelDate!;
    if (nonEmpty(extracted.licenseName)) resumeUpdate.licenseName = extracted.licenseName!;
    if (nonEmpty(extracted.licenseExpiryDate)) resumeUpdate.licenseExpiryDate = extracted.licenseExpiryDate!;
    if (nonEmpty(extracted.otherQualificationName)) resumeUpdate.otherQualificationName = extracted.otherQualificationName!;
    if (nonEmpty(extracted.otherQualificationExpiryDate)) resumeUpdate.otherQualificationExpiryDate = extracted.otherQualificationExpiryDate!;
    if (nonEmpty(extracted.traineeExperience)) resumeUpdate.traineeExperience = extracted.traineeExperience!;
    if (nonEmpty(extracted.highSchoolName)) resumeUpdate.highSchoolName = extracted.highSchoolName!;
    if (nonEmpty(extracted.highSchoolStartDate)) resumeUpdate.highSchoolStartDate = extracted.highSchoolStartDate!;
    if (nonEmpty(extracted.highSchoolEndDate)) resumeUpdate.highSchoolEndDate = extracted.highSchoolEndDate!;
    if (nonEmpty(extracted.universityName)) resumeUpdate.universityName = extracted.universityName!;
    if (nonEmpty(extracted.universityStartDate)) resumeUpdate.universityStartDate = extracted.universityStartDate!;
    if (nonEmpty(extracted.universityEndDate)) resumeUpdate.universityEndDate = extracted.universityEndDate!;
    if (nonEmpty(extracted.motivation)) resumeUpdate.motivation = extracted.motivation!;
    if (nonEmpty(extracted.selfIntroduction)) resumeUpdate.selfIntroduction = extracted.selfIntroduction!;
    if (nonEmpty(extracted.japanPurpose)) resumeUpdate.japanPurpose = extracted.japanPurpose!;
    if (nonEmpty(extracted.currentJob)) resumeUpdate.currentJob = extracted.currentJob!;
    if (nonEmpty(extracted.retirementReason)) resumeUpdate.retirementReason = extracted.retirementReason!;
    if (nonEmpty(extracted.preferenceNote)) resumeUpdate.preferenceNote = extracted.preferenceNote!;
    if (Array.isArray(extracted.workExperiences) && extracted.workExperiences.length > 0) {
      // AI が「◯◯会社 入社」と拾うことがあるので、会社名を整えてから保存する
      resumeUpdate.workExperiences = extracted.workExperiences.map((w) =>
        w && typeof w === "object" && typeof w.companyName === "string"
          ? { ...w, companyName: cleanCompanyName(w.companyName) }
          : w,
      );
    }

    let personCount = 0;
    let onboardingCount = 0;
    let resumeCount = 0;

    if (Object.keys(personUpdate).length > 0) {
      await prisma.person.update({ where: { id: personId }, data: personUpdate });
      personCount = Object.keys(personUpdate).length;
    }

    if (Object.keys(onboardingUpdate).length > 0) {
      await prisma.personOnboarding.upsert({
        where: { personId },
        create: { personId, ...onboardingUpdate },
        update: onboardingUpdate,
      });
      onboardingCount = Object.keys(onboardingUpdate).length;
    }

    if (Object.keys(resumeUpdate).length > 0) {
      await prisma.resumeProfile.upsert({
        where: { personId },
        create: { personId, ...resumeUpdate },
        update: resumeUpdate,
      });
      resumeCount = Object.keys(resumeUpdate).length;
    }

    return Response.json({
      ok: true,
      updated: { person: personCount, onboarding: onboardingCount, resume: resumeCount },
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 }
    );
  }
}
