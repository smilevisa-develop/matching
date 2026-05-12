import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import EditPersonForm from "./EditPersonForm";
import {
  CustomQuestionsProvider,
  CustomQuestionsBuilderButton,
  CustomQuestionsList,
} from "./CustomQuestionsPanel";
import ExtractPanel from "./ExtractPanel";
import PlacementPanel from "./PlacementPanel";
import DriveActionsPanel from "./DriveActionsPanel";
import PhotoPanel from "./PhotoPanel";
import CreateResumeButton from "./CreateResumeButton";

export const dynamic = "force-dynamic";

export default async function EditPersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const personId = Number(id);
  const [person, partners, customQuestions, placement, invoices, deals] = await Promise.all([
    prisma.person.findUnique({
      where: { id: personId },
      include: {
        onboarding: true,
        documents: true,
        resumeProfile: true,
      },
    }),
    prisma.partner.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.personCustomQuestion.findMany({
      where: { personId },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    }),
    prisma.personPlacement.findUnique({ where: { personId } }),
    prisma.invoice.findMany({
      where: { personId },
      orderBy: { createdAt: "desc" },
      include: {
        partner: { select: { id: true, name: true } },
        deal: { select: { id: true, title: true, company: { select: { name: true } } } },
      },
    }),
    prisma.deal.findMany({
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, company: { select: { name: true } } },
    }),
  ]);
  if (!person) notFound();

  const toDate = (d: Date | null | undefined) => (d ? d.toISOString() : null);

  const placementData = {
    acceptedAt: toDate(placement?.acceptedAt),
    preInterviewAt: toDate(placement?.preInterviewAt),
    companyInterviewAt: toDate(placement?.companyInterviewAt),
    offerAt: toDate(placement?.offerAt),
    offerAcceptedAt: toDate(placement?.offerAcceptedAt),
    applicationPlannedAt: toDate(placement?.applicationPlannedAt),
    applicationAt: toDate(placement?.applicationAt),
    applicationResultAt: toDate(placement?.applicationResultAt),
    applicationType: placement?.applicationType ?? null,
    applicantName: placement?.applicantName ?? null,
    returnHomeFlag: placement?.returnHomeFlag ?? null,
    returnHomeAt: toDate(placement?.returnHomeAt),
    entryPlannedAt: toDate(placement?.entryPlannedAt),
    entryAt: toDate(placement?.entryAt),
    joinPlannedAt: toDate(placement?.joinPlannedAt),
    joinAt: toDate(placement?.joinAt),
    sixMonthStatus: placement?.sixMonthStatus ?? null,
    consultation: placement?.consultation ?? null,
    currentAction: placement?.currentAction ?? null,
  };

  return (
    <div className="px-8 py-10">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-[var(--color-text-dark)]">候補者詳細</h1>
            <p className="text-sm text-gray-500 mt-2">
              候補者情報を「基本情報」「詳細情報」「請求」に分けて管理します。
            </p>
          </div>
          <p className="shrink-0 text-[11px] text-gray-400">
            ID #{person.id}
            {person.registeredBy ? <> ・ 登録者: <span className="font-medium text-gray-500">{person.registeredBy}</span></> : null}
            {" "}・ 追加日 {new Date(person.createdAt).toLocaleDateString("ja-JP")}
          </p>
        </div>

        <CustomQuestionsProvider
          personId={person.id}
          personName={person.name}
          initialQuestions={customQuestions.map((q) => ({
            id: q.id,
            label: q.label,
            type: q.type,
            required: q.required,
            answer: q.answer,
            fileName: q.fileName,
            fileUrl: q.fileUrl,
            active: q.active,
            sortOrder: q.sortOrder,
          }))}
          profile={{
            englishName: person.onboarding?.englishName ?? null,
            phoneNumber: person.onboarding?.phoneNumber ?? null,
            birthDate: person.onboarding?.birthDate ?? null,
            postalCode: person.onboarding?.postalCode ?? null,
            address: person.onboarding?.address ?? null,
            gender: person.resumeProfile?.gender ?? null,
            spouseStatus: person.resumeProfile?.spouseStatus ?? null,
            childrenCount: person.resumeProfile?.childrenCount ?? null,
            motivation: person.resumeProfile?.motivation ?? null,
            selfIntroduction: person.resumeProfile?.selfIntroduction ?? null,
            japanPurpose: person.resumeProfile?.japanPurpose ?? null,
            currentJob: person.resumeProfile?.currentJob ?? null,
            retirementReason: person.resumeProfile?.retirementReason ?? null,
            preferenceNote: person.resumeProfile?.preferenceNote ?? null,
            japaneseLevel: person.resumeProfile?.japaneseLevel ?? null,
            visaExpiryDate: person.resumeProfile?.visaExpiryDate ?? null,
          }}
        >
          <PhotoPanel
            personId={person.id}
            personName={person.name}
            initialPhotoUrl={person.photoUrl}
            iconActions={
              <>
                <ExtractPanel
                  personId={person.id}
                  personName={person.name}
                  existingProfile={{
                    name: person.name,
                    englishName: person.onboarding?.englishName ?? null,
                    nationality: person.nationality,
                    residenceStatus: person.residenceStatus,
                    visaExpiryDate: person.resumeProfile?.visaExpiryDate ?? null,
                    birthDate: person.onboarding?.birthDate ?? null,
                    gender: person.resumeProfile?.gender ?? null,
                    phoneNumber: person.onboarding?.phoneNumber ?? null,
                    postalCode: person.onboarding?.postalCode ?? null,
                    address: person.onboarding?.address ?? null,
                    spouseStatus: person.resumeProfile?.spouseStatus ?? null,
                    childrenCount: person.resumeProfile?.childrenCount ?? null,
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
                    motivation: person.resumeProfile?.motivation ?? null,
                    selfIntroduction: person.resumeProfile?.selfIntroduction ?? null,
                    japanPurpose: person.resumeProfile?.japanPurpose ?? null,
                    currentJob: person.resumeProfile?.currentJob ?? null,
                    retirementReason: person.resumeProfile?.retirementReason ?? null,
                    preferenceNote: person.resumeProfile?.preferenceNote ?? null,
                  }}
                />
                <CreateResumeButton
                  personId={person.id}
                  personName={person.name}
                  englishName={person.onboarding?.englishName ?? null}
                />
                <CustomQuestionsBuilderButton />
                <DriveActionsPanel personId={person.id} initialDriveFolderUrl={person.driveFolderUrl ?? null} />
              </>
            }
          />

          <EditPersonForm
            person={person}
            partners={partners}
            customTabContent={<CustomQuestionsList />}
            placementTabContent={
              <PlacementPanel
                personId={person.id}
                personName={person.name}
                initialPlacement={placementData}
                initialInvoices={invoices.map((invoice) => ({
                  id: invoice.id,
                  dealId: invoice.dealId,
                  unitPrice: invoice.unitPrice,
                  invoiceDate: toDate(invoice.invoiceDate),
                  invoiceAmount: invoice.invoiceAmount,
                  invoiceNumber: invoice.invoiceNumber,
                  invoiceStatus: invoice.invoiceStatus,
                  invoiceUrl: invoice.invoiceUrl,
                  channel: invoice.channel,
                  partnerId: invoice.partnerId,
                  partnerName: invoice.partner?.name ?? null,
                  costAmount: invoice.costAmount,
                  paInvoiceUrl: invoice.paInvoiceUrl,
                  paPaid: invoice.paPaid,
                  paPaidAt: toDate(invoice.paPaidAt),
                  notes: invoice.notes,
                  dealTitle: invoice.deal?.title ?? null,
                  companyName: invoice.deal?.company?.name ?? null,
                }))}
                partners={partners}
                deals={deals.map((d) => ({ id: d.id, title: d.title, companyName: d.company.name }))}
              />
            }
          />
        </CustomQuestionsProvider>
      </div>
    </div>
  );
}
