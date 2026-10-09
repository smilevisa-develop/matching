import { prisma } from "@/lib/prisma";
import { requireCurrentAccount } from "@/lib/auth";
import { calcUrgency, resolveStage } from "@/lib/onboarding-flow";
import OnboardingBoard, { type OnboardingCard } from "./OnboardingBoard";

export const dynamic = "force-dynamic";

/**
 * 内定者管理ボード。
 *
 * 内定〜入社までを 1 枚のボードで管理する (内定管理と入社管理は分けない)。
 * 列は実際のワークフロー (人材紹介連携ワークフロー STEP1〜12) に合わせ、
 * 問題が起きた人は「保留・問題対応中」列へ一時的に逃がす。
 *
 * カードだけで「緊急か / 担当は誰か / どの工程で止まっているか / 何が足りないか」が
 * 分かるようにしている。
 */
export default async function OnboardingPage() {
  await requireCurrentAccount();

  const [placements, staff] = await Promise.all([
    prisma.personPlacement.findMany({
      include: {
        followUpOwner: { select: { id: true, name: true } },
        person: {
          select: {
            id: true,
            name: true,
            photoUrl: true,
            nationality: true,
            residenceStatus: true,
            onboarding: { select: { englishName: true } },
            resumeProfile: { select: { visaExpiryDate: true } },
            dealCandidates: {
              orderBy: { updatedAt: "desc" },
              take: 1,
              select: {
                deal: {
                  select: {
                    title: true,
                    company: { select: { name: true } },
                    owner: { select: { name: true } },
                  },
                },
              },
            },
          },
        },
        tasks: { orderBy: { sortOrder: "asc" } },
        issues: { orderBy: { createdAt: "desc" } },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.staffAccount.findMany({ select: { id: true, name: true }, orderBy: { id: "asc" } }),
  ]);

  const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

  const cards: OnboardingCard[] = placements.map((p) => {
    const deal = p.person.dealCandidates[0]?.deal ?? null;
    const stage = resolveStage(p);
    const openIssues = p.issues.filter((i) => i.status === "open").length;
    const overdueTasks = p.tasks.filter(
      (t) => !t.doneAt && t.dueAt && t.dueAt.getTime() < Date.now(),
    ).length;
    const urgency = calcUrgency({
      stage,
      openIssues,
      overdueTasks,
      nextActionDueAt: p.nextActionDueAt,
      applicationPlannedAt: p.applicationPlannedAt,
      applicationAt: p.applicationAt,
      joinPlannedAt: p.joinPlannedAt,
      joinAt: p.joinAt,
      visaExpiryDate: p.person.resumeProfile?.visaExpiryDate ?? null,
      stageChangedAt: p.stageChangedAt,
    });

    return {
      personId: p.person.id,
      personName: p.person.name,
      englishName: p.person.onboarding?.englishName ?? null,
      photoUrl: p.person.photoUrl,
      nationality: p.person.nationality,
      residenceStatus: p.person.residenceStatus,
      visaExpiryDate: p.person.resumeProfile?.visaExpiryDate ?? null,
      companyName: deal?.company.name ?? null,
      recruitOwnerName: deal?.owner?.name ?? null,
      followUpOwnerId: p.followUpOwnerId,
      followUpOwnerName: p.followUpOwner?.name ?? null,
      applicationType: p.applicationType,
      stage,
      stageChangedAt: iso(p.stageChangedAt),
      holdReason: p.holdReason,
      currentAction: p.currentAction,
      nextActionDueAt: iso(p.nextActionDueAt),
      offerAcceptedAt: iso(p.offerAcceptedAt),
      applicationPlannedAt: iso(p.applicationPlannedAt),
      applicationAt: iso(p.applicationAt),
      applicationResultAt: iso(p.applicationResultAt),
      entryPlannedAt: iso(p.entryPlannedAt),
      joinPlannedAt: iso(p.joinPlannedAt),
      joinAt: iso(p.joinAt),
      urgency: urgency.level,
      urgencyReasons: urgency.reasons,
      tasks: p.tasks.map((t) => ({
        id: t.id,
        category: t.category,
        title: t.title,
        dueAt: iso(t.dueAt),
        doneAt: iso(t.doneAt),
        doneBy: t.doneBy,
      })),
      issues: p.issues.map((i) => ({
        id: i.id,
        title: i.title,
        detail: i.detail,
        status: i.status,
        recordedBy: i.recordedBy,
        createdAt: i.createdAt.toISOString(),
      })),
    };
  });

  return (
    <div className="space-y-5 p-8">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-dark)]">内定者管理</h1>
        <p className="mt-1 text-sm text-gray-500">
          内定から入社までを 1 つのボードで管理します。問題が起きた人は「保留・問題対応中」へ移してください。
        </p>
      </div>
      <OnboardingBoard initialCards={cards} staff={staff} />
    </div>
  );
}
