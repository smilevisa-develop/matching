import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import IntakeClient from "./IntakeClient";

export const dynamic = "force-dynamic";

export default async function IntakePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!token || token.length < 8) notFound();

  const person = await prisma.person.findUnique({
    where: { intakeToken: token },
    select: {
      id: true,
      name: true,
      residenceStatus: true,
      intakeConfig: true,
      onboarding: { select: { englishName: true } },
      resumeProfile: {
        select: {
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
          type: q.type === "textarea" ? "textarea" : "text",
        }))
        .filter((q) => q.key && q.label)
    : [];

  return (
    <IntakeClient
      token={token}
      personName={person.name}
      englishName={person.onboarding?.englishName ?? null}
      residenceStatus={person.residenceStatus ?? null}
      excludedKeys={excludedKeys}
      customQuestions={customQuestions as { key: string; label: string; required: boolean; type: "text" | "textarea" }[]}
      initial={{
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
  );
}
