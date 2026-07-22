import { prisma } from "@/lib/prisma";
import PersonnelTableClient from "./PersonnelTableClient";

export const dynamic = "force-dynamic";

export default async function PersonnelPage() {
  const persons = await prisma.person.findMany({
    include: {
      partner: { select: { name: true, id: true } },
      onboarding: { select: { phoneNumber: true, englishName: true, birthDate: true, postalCode: true, address: true } },
      resumeProfile: {
        select: {
          gender: true,
          spouseStatus: true,
          childrenCount: true,
          motivation: true,
          selfIntroduction: true,
          japanPurpose: true,
          currentJob: true,
          retirementReason: true,
          preferenceNote: true,
          visaExpiryDate: true,
          japaneseLevel: true,
          japaneseLevelDate: true,
          licenseName: true,
          licenseExpiryDate: true,
          otherQualificationName: true,
          otherQualificationExpiryDate: true,
          traineeExperience: true,
          highSchoolName: true,
          highSchoolStartDate: true,
          highSchoolEndDate: true,
          universityName: true,
          universityStartDate: true,
          universityEndDate: true,
        },
      },
    },
    // ID 降順 (新しい候補者ほど上)
    orderBy: { id: "desc" },
  });

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-dark)]">候補者一覧</h1>
          <p className="text-sm text-gray-500 mt-1">{persons.length} 件</p>
        </div>
      </div>
      <PersonnelTableClient
        headerExtras={null}
        persons={persons.map((person) => ({
          id: person.id,
          name: person.name,
          photoUrl: person.photoUrl,
          driveFolderUrl: person.driveFolderUrl,
          nationality: person.nationality,
          residenceStatus: person.residenceStatus,
          channel: person.channel,
          partnerName: person.partner?.name ?? null,
          englishName: person.onboarding?.englishName ?? null,
          phoneNumber: person.onboarding?.phoneNumber ?? null,
          gender: person.resumeProfile?.gender ?? null,
          birthDate: person.onboarding?.birthDate ?? null,
          postalCode: person.onboarding?.postalCode ?? null,
          address: person.onboarding?.address ?? null,
          spouseStatus: person.resumeProfile?.spouseStatus ?? null,
          childrenCount: person.resumeProfile?.childrenCount ?? null,
          motivation: person.resumeProfile?.motivation ?? null,
          selfIntroduction: person.resumeProfile?.selfIntroduction ?? null,
          japanPurpose: person.resumeProfile?.japanPurpose ?? null,
          currentJob: person.resumeProfile?.currentJob ?? null,
          retirementReason: person.resumeProfile?.retirementReason ?? null,
          preferenceNote: person.resumeProfile?.preferenceNote ?? null,
          visaExpiryDate: person.resumeProfile?.visaExpiryDate ?? null,
          japaneseLevel: person.resumeProfile?.japaneseLevel ?? null,
          japaneseLevelDate: person.resumeProfile?.japaneseLevelDate ?? null,
          licenseName: person.resumeProfile?.licenseName ?? null,
          licenseExpiryDate: person.resumeProfile?.licenseExpiryDate ?? null,
          otherQualificationName: person.resumeProfile?.otherQualificationName ?? null,
          otherQualificationExpiryDate: person.resumeProfile?.otherQualificationExpiryDate ?? null,
          traineeExperience: person.resumeProfile?.traineeExperience ?? null,
          highSchoolName: person.resumeProfile?.highSchoolName ?? null,
          highSchoolStartDate: person.resumeProfile?.highSchoolStartDate ?? null,
          highSchoolEndDate: person.resumeProfile?.highSchoolEndDate ?? null,
          universityName: person.resumeProfile?.universityName ?? null,
          universityStartDate: person.resumeProfile?.universityStartDate ?? null,
          universityEndDate: person.resumeProfile?.universityEndDate ?? null,
        }))}
      />
    </div>
  );
}
