import { prisma } from "@/lib/prisma";
import { requireCurrentAccount } from "@/lib/auth";
import { inferPlacementStage } from "@/lib/placement-stage";
import OnboardingBoard, { type OnboardingCard } from "./OnboardingBoard";

export const dynamic = "force-dynamic";

/**
 * 内定後管理ボード。
 *
 * 内定承諾から入社までを Trello のような列 (ステージ) で並べ、カードごとに
 * 「やること (チェックリスト)」「次アクションと期限」「起きた問題」を持たせる。
 * 既存の「入社進捗」は日付だけのシンプルな画面なので、そちらは残したまま別ページにしている。
 */
export default async function OnboardingPage() {
  await requireCurrentAccount();

  const placements = await prisma.personPlacement.findMany({
    include: {
      person: {
        select: {
          id: true,
          name: true,
          photoUrl: true,
          nationality: true,
          residenceStatus: true,
          onboarding: { select: { englishName: true } },
          dealCandidates: {
            orderBy: { updatedAt: "desc" },
            take: 1,
            select: {
              stage: true,
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
  });

  const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

  const cards: OnboardingCard[] = placements.map((p) => {
    const dc = p.person.dealCandidates[0];
    return {
      personId: p.person.id,
      personName: p.person.name,
      englishName: p.person.onboarding?.englishName ?? null,
      photoUrl: p.person.photoUrl,
      nationality: p.person.nationality,
      companyName: dc?.deal.company.name ?? null,
      dealTitle: dc?.deal.title ?? null,
      ownerName: dc?.deal.owner?.name ?? null,
      stage: inferPlacementStage({
        stage: p.stage,
        offerAt: p.offerAt,
        offerAcceptedAt: p.offerAcceptedAt,
        applicationAt: p.applicationAt,
        applicationResultAt: p.applicationResultAt,
        entryAt: p.entryAt,
        joinAt: p.joinAt,
      }),
      currentAction: p.currentAction,
      nextActionDueAt: iso(p.nextActionDueAt),
      offerAcceptedAt: iso(p.offerAcceptedAt),
      applicationAt: iso(p.applicationAt),
      entryPlannedAt: iso(p.entryPlannedAt),
      joinPlannedAt: iso(p.joinPlannedAt),
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

  const owners = Array.from(
    new Set(cards.map((c) => c.ownerName).filter((n): n is string => Boolean(n))),
  ).sort();

  return (
    <div className="space-y-5 p-8">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-dark)]">内定後管理</h1>
        <p className="mt-1 text-sm text-gray-500">
          内定承諾から入社までを、やること・期限・担当つきで管理します。カードはドラッグで次の列へ動かせます。
        </p>
      </div>
      <OnboardingBoard initialCards={cards} owners={owners} />
    </div>
  );
}
