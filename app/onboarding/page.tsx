import { prisma } from "@/lib/prisma";
import { requireCurrentAccount } from "@/lib/auth";
import { resolveStage } from "@/lib/onboarding-flow";
import OnboardingBoard, { type OnboardingCard } from "./OnboardingBoard";

export const dynamic = "force-dynamic";

/**
 * 内定者管理ボード (Trello の置き換え)。
 *
 * 使ってもらうことを優先し、カードは「誰・どこの企業・メモ」だけに絞っている。
 * チェックリスト / 問題記録 / 緊急度はデータと API を残したまま画面から外した
 * (必要になったら戻す)。
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
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.staffAccount.findMany({ select: { id: true, name: true }, orderBy: { id: "asc" } }),
  ]);

  const cards: OnboardingCard[] = placements.map((p) => ({
    personId: p.person.id,
    personName: p.person.name,
    residenceStatus: p.person.residenceStatus,
    companyName: p.person.dealCandidates[0]?.deal.company.name ?? null,
    ownerId: p.followUpOwnerId,
    ownerName: p.followUpOwner?.name ?? null,
    stage: resolveStage(p),
    memo: p.currentAction ?? p.holdReason ?? "",
    applicationAt: p.applicationAt ? p.applicationAt.toISOString().slice(0, 10) : "",
  }));

  return (
    <div className="space-y-5 p-8">
      <h1 className="text-2xl font-bold text-[var(--color-text-dark)]">内定者管理</h1>
      <OnboardingBoard initialCards={cards} staff={staff} />
    </div>
  );
}
