import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import EditPersonForm from "./EditPersonForm";
import {
  CustomQuestionsProvider,
  CustomQuestionsList,
} from "./CustomQuestionsPanel";
import ExtractPanel from "./ExtractPanel";
import PlacementPanel from "./PlacementPanel";
import DriveActionsPanel from "./DriveActionsPanel";
import PhotoPanel from "./PhotoPanel";
import CreateResumeButton from "./CreateResumeButton";
import IntakeLinkButton from "./IntakeLinkButton";
import JapaneseCheckLinkButton from "./JapaneseCheckLinkButton";
import { PanelActionsProvider } from "./PanelActions";
import { IconActionDivider } from "./IconAction";
import PreparationPanel, { type PreparationState } from "./PreparationPanel";
import TestResetPanel from "./TestResetPanel";
import RecommendedCompanySelect from "./RecommendedCompanySelect";
import ChecklistPanel from "./ChecklistPanel";
import { companyLabel } from "@/lib/company-label";
import { hasEnoughJobInfo, nationalityToLanguage } from "@/lib/job-checklist";
import JapaneseCheckPanel, {
  type JapaneseCheckView,
  type JapaneseCheckRecordingView,
} from "./JapaneseCheckPanel";
import {
  LOCATION_QUESTION_KEY,
  buildInterviewSections,
  parseLocationAnswer,
  type InterviewQuestion,
} from "@/lib/interview-questions";

export const dynamic = "force-dynamic";

export default async function EditPersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const personId = Number(id);
  const [person, partners, customQuestions, placement, invoices, deals, companies] = await Promise.all([
    prisma.person.findUnique({
      where: { id: personId },
      include: {
        onboarding: true,
        documents: true,
        resumeProfile: true,
        japaneseCheck: true,
        dealCandidates: { select: { deal: { select: { company: { select: { name: true, externalId: true } } } } } },
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
    prisma.company.findMany({ orderBy: { name: "asc" }, select: { name: true, externalId: true } }),
  ]);
  if (!person) notFound();

  // 推薦先企業は「企業ID_企業名」の合体形で扱う (内定者/請求が企業IDを引ける形)
  const dealCompanies = Array.from(
    new Set(
      person.dealCandidates
        .map((dc) => companyLabel(dc.deal.company.externalId, dc.deal.company.name))
        .filter(Boolean),
    ),
  );
  const companyOptions = companies
    .map((c) => companyLabel(c.externalId, c.name))
    .filter(Boolean);

  // ── 母国語チェックリスト: 前提(推薦先企業の求人情報の有無) と 送信履歴 ──
  // 実効的な推薦先 = 手動上書き(recommendedCompany) があればそれ、無ければ案件由来(dealCompanies)
  const effectiveRecommendedCompany =
    (person.recommendedCompany && person.recommendedCompany.trim()) || dealCompanies[0] || null;
  const checklistExternalId = (() => {
    const s = (effectiveRecommendedCompany ?? "").trim();
    if (!s) return null;
    const idx = s.search(/[_＿]/);
    const idPart = (idx >= 0 ? s.slice(0, idx) : s).trim().toLowerCase();
    return /^[a-z0-9]{2,}$/.test(idPart) ? idPart : null;
  })();
  const [checklistCompany, checklistDeliveriesRaw] = await Promise.all([
    checklistExternalId
      ? prisma.company.findFirst({
          where: { externalId: checklistExternalId },
          select: { deals: { select: { conditions: true } } },
        })
      : Promise.resolve(null),
    prisma.jobChecklistDelivery.findMany({
      where: { personId },
      orderBy: { createdAt: "desc" },
      select: { id: true, language: true, token: true, sentAt: true, openedAt: true, completedAt: true },
    }),
  ]);
  const companyHasJobInfo = Boolean(
    checklistCompany?.deals.some((d) => hasEnoughJobInfo(d.conditions)),
  );
  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  const checklistDeliveries = checklistDeliveriesRaw.map((d) => ({
    id: d.id,
    language: d.language,
    token: d.token,
    sentAt: iso(d.sentAt),
    openedAt: iso(d.openedAt),
    completedAt: iso(d.completedAt),
  }));
  const defaultChecklistLang = nationalityToLanguage(person.nationality);

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

  // ── 事前面談の準備 ステータスを計算 ──
  const rp = person.resumeProfile;
  const interviewAnswers: Record<string, string> =
    rp?.interviewAnswers && typeof rp.interviewAnswers === "object"
      ? (rp.interviewAnswers as Record<string, string>)
      : {};

  const isQuestionAnswered = (q: InterviewQuestion): boolean => {
    if (q.existingField) return ((rp?.[q.existingField] as string | null) ?? "").trim().length > 0;
    return (interviewAnswers[q.jsonKey ?? q.key] ?? "").trim().length > 0;
  };

  const mustQuestions = buildInterviewSections({
    priority: "must",
    ctx: {
      residenceStatus: person.residenceStatus,
      location: parseLocationAnswer(interviewAnswers[LOCATION_QUESTION_KEY]),
      employmentStatus: interviewAnswers.employmentStatus ?? null,
    },
  }).flatMap((s) => s.questions);
  const unansweredMust = mustQuestions.filter((q) => !isQuestionAnswered(q));

  // AI 抽出等で埋まっている主要項目数 (表示用)
  const extractedFieldCount = [
    person.onboarding?.englishName,
    person.onboarding?.birthDate,
    person.onboarding?.address,
    person.onboarding?.phoneNumber,
    rp?.gender,
    rp?.visaExpiryDate,
    rp?.japaneseLevel,
    rp?.highSchoolName,
    rp?.universityName,
    rp?.motivation,
    rp?.selfIntroduction,
    rp?.currentJob,
  ].filter((v) => typeof v === "string" && v.trim().length > 0).length;

  // ── 日本語チェックの表示用データ ──
  const jc = person.japaneseCheck;
  const japaneseCheckView: JapaneseCheckView | null = jc
    ? {
        estimatedLevel: jc.estimatedLevel,
        pronunciation: jc.pronunciation,
        fluency: jc.fluency,
        vocabulary: jc.vocabulary,
        grammar: jc.grammar,
        summary: jc.summary,
        levelReason: jc.levelReason,
        confidence: jc.confidence,
        evidence: (jc.evidence ?? null) as JapaneseCheckView["evidence"],
        assessedAt: toDate(jc.assessedAt),
        recordings: (Array.isArray(jc.recordings) ? jc.recordings : []).map((r) => {
          const o = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
          return {
            key: typeof o.key === "string" ? o.key : "",
            question: typeof o.question === "string" ? o.question : "",
            transcript: typeof o.transcript === "string" ? o.transcript : "",
            driveFileId: typeof o.driveFileId === "string" ? o.driveFileId : null,
            driveFileUrl: typeof o.driveFileUrl === "string" ? o.driveFileUrl : null,
            mimeType: typeof o.mimeType === "string" ? o.mimeType : "",
          } satisfies JapaneseCheckRecordingView;
        }),
      }
    : null;

  const preparationState: PreparationState = {
    resumeImported: Boolean(rp?.resumeFileUrl) || extractedFieldCount >= 5,
    extractedFieldCount,
    // Step2: 日本語チェック (専用リンク)。録音が 1 件でも届いていれば実施済み
    japaneseCheckIssued: Boolean(person.japaneseCheckToken),
    japaneseCheckToken: person.japaneseCheckToken ?? null,
    japaneseCheckRecorded: (japaneseCheckView?.recordings.length ?? 0) > 0,
    japaneseCheckLevel: jc?.assessedAt ? jc.estimatedLevel : null,
    intakeIssued: Boolean(person.intakeToken),
    intakeToken: person.intakeToken ?? null,
    mustTotal: mustQuestions.length,
    mustAnswered: mustQuestions.length - unansweredMust.length,
    // 長すぎると横に溢れるので 5 件まで
    unansweredLabels: unansweredMust.slice(0, 5).map((q) => shortLabel(q.question)),
    // Step4: 母国語チェックリストの状況
    checklistSent: checklistDeliveries.some((d) => d.sentAt),
    checklistOpened: checklistDeliveries.some((d) => d.openedAt),
    checklistCompleted: checklistDeliveries.some((d) => d.completedAt),
    checklistToken: checklistDeliveries[0]?.token ?? null,
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
            {person.registeredBy ? <>登録者: <span className="font-medium text-gray-500">{person.registeredBy}</span> ・ </> : null}
            追加日 {new Date(person.createdAt).toLocaleDateString("ja-JP")}
          </p>
        </div>

        {/* テスト用候補者 (ID:2) だけに表示するリセット/投入ツール */}
        {person.id === 2 ? <TestResetPanel personId={person.id} /> : null}

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
          <PanelActionsProvider>
          <PhotoPanel
            personId={person.id}
            personName={person.name}
            initialPhotoUrl={person.photoUrl}
            extraControl={
              <RecommendedCompanySelect
                personId={person.id}
                initial={person.recommendedCompany}
                companyOptions={companyOptions}
                dealCompanies={dealCompanies}
              />
            }
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
                <IconActionDivider />
                <JapaneseCheckLinkButton personId={person.id} personName={person.name} />
                <IntakeLinkButton
                  personId={person.id}
                  personName={person.name}
                  answers={{
                    motivation: person.resumeProfile?.motivation ?? "",
                    selfIntroduction: person.resumeProfile?.selfIntroduction ?? "",
                    japanPurpose: person.resumeProfile?.japanPurpose ?? "",
                    currentJob: person.resumeProfile?.currentJob ?? "",
                    retirementReason: person.resumeProfile?.retirementReason ?? "",
                    interviewAnswers:
                      person.resumeProfile?.interviewAnswers &&
                      typeof person.resumeProfile.interviewAnswers === "object"
                        ? (person.resumeProfile.interviewAnswers as Record<string, string>)
                        : {},
                  }}
                />
                <IconActionDivider />
                <DriveActionsPanel personId={person.id} initialDriveFolderUrl={person.driveFolderUrl ?? null} />
              </>
            }
          />

          <PreparationPanel
            personName={person.name}
            state={preparationState}
            checklistContent={
              <ChecklistPanel
                embedded
                personId={person.id}
                recommendedCompany={effectiveRecommendedCompany}
                companyHasJobInfo={companyHasJobInfo}
                defaultLanguage={defaultChecklistLang}
                deliveries={checklistDeliveries}
              />
            }
          />
          </PanelActionsProvider>

          <EditPersonForm
            person={person}
            partners={partners}
            customTabContent={<CustomQuestionsList />}
            japaneseCheckContent={
              <JapaneseCheckPanel personId={person.id} initial={japaneseCheckView} />
            }
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

/** 質問文をチップ表示用に短くする (「?」以降や補足括弧を落とす) */
function shortLabel(question: string): string {
  const cut = question.split(/[？?（(]/)[0].trim();
  return cut.length > 16 ? `${cut.slice(0, 16)}…` : cut;
}
