import { prisma } from "@/lib/prisma";
import { requireCurrentAccount } from "@/lib/auth";
import { readSupports, resolveStage } from "@/lib/onboarding-flow";
import OnboardingBoard, { type OnboardingCard } from "./OnboardingBoard";

export const dynamic = "force-dynamic";

/**
 * 内定者管理ボード (Trello の置き換え)。
 *
 * - 候補者から来た内定者 (内定承諾で自動で載る) と、候補者とは別に追加した内定者 (書類作成のみ) の両方を出す
 * - 委託管理の企業・人材紹介会社 (WILLOF・ADECCO など) の内定者は出さない。件数だけ出して切り替えられる
 * - カードは「誰・どこの企業・次にやること・今の工程の進み具合」だけ。期限は出さない
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
            nationality: true,
            photoUrl: true,
            partner: { select: { name: true } },
            onboarding: { select: { englishName: true } },
            dealCandidates: {
              orderBy: { updatedAt: "desc" },
              take: 1,
              select: { deal: { select: { company: { select: { name: true, supportType: true, companyKind: true } } } } },
            },
          },
        },
        tasks: {
          orderBy: { sortOrder: "asc" },
          select: { id: true, category: true, title: true, doneAt: true, note: true },
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

  const cards: OnboardingCard[] = placements.map((p) => {
    const company = p.person?.dealCandidates[0]?.deal.company ?? null;
    const stage = resolveStage(p);
    return {
      id: p.id,
      personId: p.person?.id ?? null,
      // カードの名前はアルファベット (英語名)。無い人だけカナ名
      personName: p.person?.onboarding?.englishName?.trim() || p.person?.name || p.externalName || "(名前なし)",
      kanaName: p.person?.onboarding?.englishName?.trim() ? p.person.name : null,
      nationality: p.person?.nationality ?? "",
      photoUrl: p.person?.photoUrl ?? null,
      partnerName: p.person?.partner?.name ?? null,
      residenceStatus: p.person?.residenceStatus ?? p.externalResidenceStatus ?? "",
      companyName: company?.name ?? p.externalCompanyName ?? null,
      external: !p.person,
      // 委託管理の企業と人材紹介会社の内定者はボードに出さない
      outsourced: company?.supportType === "委託管理" || company?.companyKind === "人材紹介会社",
      ownerId: p.followUpOwnerId,
      ownerName: p.followUpOwner?.name ?? null,
      stage,
      memo: p.currentAction ?? "",
      holdReason: p.holdReason ?? "",
      applicationAt: ymd(p.applicationAt),
      offerAcceptedAt: ymd(p.offerAcceptedAt ?? p.offerAt),
      applicationType: p.applicationType ?? "",
      applicationMethod: p.applicationMethod ?? "",
      supports: readSupports(p.supports),
      tasks: p.tasks.map((t) => ({
        id: t.id,
        category: t.category,
        title: t.title,
        done: Boolean(t.doneAt),
        note: t.note ?? "",
      })),
      issues: p.issues.map((i) => ({
        id: i.id,
        title: i.title,
        open: i.status === "open",
        createdAt: ymd(i.createdAt),
      })),
    };
  });

  return (
    <div className="space-y-5 p-8">
      <OnboardingBoard initialCards={cards} staff={staff} />
    </div>
  );
}
