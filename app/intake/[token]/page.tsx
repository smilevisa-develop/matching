import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import IntakeClient, { type WorkRow } from "./IntakeClient";
import { INTAKE_LANG_LABELS, intakeLang, type IntakeLang } from "@/lib/intake-i18n";
import { isDevPreview } from "@/lib/dev-preview";
import { SAMPLE_INTAKE_CUSTOM_QUESTIONS, SAMPLE_PERSON } from "@/lib/dev-preview-samples";
import DevPreviewBanner from "@/app/components/DevPreviewBanner";
import { normalizeWorkHistories } from "@/lib/candidate-profile";
import { withTakeHomeSummary } from "@/lib/interview-questions";

export const dynamic = "force-dynamic";

export default async function IntakePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { token } = await params;
  if (await isDevPreview(token)) {
    const { lang: q } = await searchParams;
    const lang: IntakeLang = q && q in INTAKE_LANG_LABELS ? (q as IntakeLang) : "vi";
    return (
      <>
        <DevPreviewBanner langs={INTAKE_LANG_LABELS} current={lang} basePath={`/intake/${token}`} />
        <IntakeClient
          key={lang}
          preview
          token={token}
          lang={lang}
          personName={SAMPLE_PERSON.name}
          englishName={SAMPLE_PERSON.englishName}
          residenceStatus={SAMPLE_PERSON.residenceStatus}
          excludedKeys={[]}
          customQuestions={SAMPLE_INTAKE_CUSTOM_QUESTIONS}
          basic={{ englishName: SAMPLE_PERSON.englishName }}
          initialWork={[]}
          initial={{ motivation: "", selfIntroduction: "", japanPurpose: "", currentJob: "", retirementReason: "", interviewAnswers: {} }}
        />
      </>
    );
  }
  if (!token || token.length < 8) notFound();

  const person = await prisma.person.findUnique({
    where: { intakeToken: token },
    select: {
      id: true,
      name: true,
      nationality: true,
      email: true,
      residenceStatus: true,
      intakeConfig: true,
      onboarding: { select: { englishName: true, birthDate: true, address: true, phoneNumber: true, postalCode: true } },
      resumeProfile: {
        select: {
          gender: true,
          spouseStatus: true,
          childrenCount: true,
          workExperiences: true,
          motivation: true,
          selfIntroduction: true,
          japanPurpose: true,
          currentJob: true,
          retirementReason: true,
          interviewAnswers: true,
        },
      },
    },
  });
  if (!person) notFound();

  const cfg =
    person.intakeConfig && typeof person.intakeConfig === "object"
      ? (person.intakeConfig as Record<string, unknown>)
      : {};
  const excludedKeys = Array.isArray(cfg.excludedKeys)
    ? (cfg.excludedKeys as string[]).filter((s) => typeof s === "string")
    : [];
  const customQuestions = Array.isArray(cfg.customQuestions)
    ? (cfg.customQuestions as Array<{ key?: unknown; label?: unknown; required?: unknown; type?: unknown }>)
        .map((q) => ({
          key: typeof q.key === "string" ? q.key : "",
          label: typeof q.label === "string" ? q.label : "",
          required: q.required === true,
          type: q.type === "textarea" ? "textarea" : q.type === "file" ? "file" : "text",
        }))
        .filter((q) => q.key && q.label)
    : [];
  return (
    <IntakeClient
      token={token}
      lang={intakeLang(person.nationality)}
      personName={person.name}
      englishName={person.onboarding?.englishName ?? null}
      residenceStatus={person.residenceStatus ?? null}
      excludedKeys={excludedKeys}
      customQuestions={customQuestions as { key: string; label: string; required: boolean; type: "text" | "textarea" | "file" }[]}
      basic={{
        englishName: person.onboarding?.englishName ?? "",
        birthDate: person.onboarding?.birthDate ?? "",
        gender: person.resumeProfile?.gender ?? "",
        phoneNumber: person.onboarding?.phoneNumber ?? "",
        email: person.email ?? "",
        address: person.onboarding?.address ?? "",
        postalCode: person.onboarding?.postalCode ?? "",
        spouseStatus: person.resumeProfile?.spouseStatus ?? "",
        childrenCount: (person.resumeProfile?.childrenCount ?? "").replace(/[^0-9]/g, ""),
      }}
      initialWork={normalizeWorkHistories(person.resumeProfile?.workExperiences).map(
        (w): WorkRow => ({ companyName: w.companyName, startDate: w.startDate, endDate: w.endDate, content: w.content, reason: w.reason }),
      )}
      initial={{
        motivation: person.resumeProfile?.motivation ?? "",
        selfIntroduction: person.resumeProfile?.selfIntroduction ?? "",
        japanPurpose: person.resumeProfile?.japanPurpose ?? "",
        currentJob: person.resumeProfile?.currentJob ?? "",
        retirementReason: person.resumeProfile?.retirementReason ?? "",
        interviewAnswers:
          person.resumeProfile?.interviewAnswers &&
          typeof person.resumeProfile.interviewAnswers === "object"
            ? withTakeHomeSummary(person.resumeProfile.interviewAnswers as Record<string, string>)
            : {},
      }}
    />
  );
}
