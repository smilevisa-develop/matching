import { prisma } from "@/lib/prisma";
import { requireCurrentAccount } from "@/lib/auth";
import { resolveStage } from "@/lib/onboarding-flow";
import OnboardingBoard, { type OnboardingCard } from "./OnboardingBoard";

export const dynamic = "force-dynamic";

/**
 * 内定者管理ボード (Trello の置き換え)。
 *
 * カードは「誰・どこの企業・次にやること・今の工程の進み具合」だけ。
 * カードを押すと、今いる工程のチェックリストだけが大きく出る
 * (他の工程は畳んでおく。全部見せると何をすればいいか分からなくなるため)。
 */
export default async function OnboardingPage() {
  await requireCurrentAccount();

  const [placements, staff] = await Promise.all([
    prisma.personPlacement.findMany({
      include: {
        followUpOwner: { select: { name: true } },
        person: {
          select: {
            id: true,
            name: true,
            residenceStatus: true,
            dealCandidates: {
              orderBy: { updatedAt: "desc" },
              take: 1,
              select: { deal: { select: { company: { select: { name: true } } } } },
            },
          },
        },
        tasks: {
          orderBy: { sortOrder: "asc" },
          select: { id: true, category: true, title: true, dueAt: true, doneAt: true, note: true },
        },
        issues: {
          orderBy: { createdAt: "desc" },
          select: { id: true, title: true, status: true, createdAt: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.staffAccount.findMany({ select: { id: true, name: true }, orderBy: { id: "asc" } }),
  ]);

  const ymd = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

  const cards: OnboardingCard[] = placements.map((p) => ({
    personId: p.person.id,
    personName: p.person.name,
    residenceStatus: p.person.residenceStatus,
    companyName: p.person.dealCandidates[0]?.deal.company.name ?? null,
    ownerId: p.followUpOwnerId,
    ownerName: p.followUpOwner?.name ?? null,
    stage: resolveStage(p),
    memo: p.currentAction ?? p.holdReason ?? "",
    applicationAt: ymd(p.applicationAt),
    offerAcceptedAt: ymd(p.offerAcceptedAt ?? p.offerAt),
    applicationType: p.applicationType ?? "",
    tasks: p.tasks.map((t) => ({
      id: t.id,
      category: t.category,
      title: t.title,
      dueAt: ymd(t.dueAt),
      done: Boolean(t.doneAt),
      note: t.note ?? "",
    })),
    issues: p.issues.map((i) => ({
      id: i.id,
      title: i.title,
      open: i.status === "open",
      createdAt: ymd(i.createdAt),
    })),
  }));

  return (
    <div className="space-y-5 p-8">
      <h1 className="text-2xl font-bold text-[var(--color-text-dark)]">内定者管理</h1>
      <OnboardingBoard initialCards={cards} staff={staff} />
    </div>
  );
}
