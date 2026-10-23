import { prisma } from "@/lib/prisma";
import { requireCurrentAccount } from "@/lib/auth";
import { MERGE_RECORDS } from "@/lib/duplicate-merge-records";
import { findDuplicatePersons } from "@/lib/duplicate-person";
import DuplicateReviewList, { type ReviewGroup, type OpenPair } from "./DuplicateReviewList";

export const dynamic = "force-dynamic";

/**
 * 重複していた候補者をまとめた結果の確認ページ (一時的)。
 * 担当者が組ごとに「問題なし / 別人 (戻してほしい)」を選ぶ。下には、まだ残っている重複の疑いも出す。
 */
export default async function DuplicatesPage() {
  await requireCurrentAccount();
  const keptIds = MERGE_RECORDS.map((r) => r.keptId);
  const removedPartnerIds = MERGE_RECORDS.flatMap((r) => r.removed.map((x) => x.partnerId)).filter((v): v is number => !!v);

  const [people, reviews, partners, all] = await Promise.all([
    prisma.person.findMany({
      where: { id: { in: keptIds } },
      select: {
        id: true,
        name: true,
        photoUrl: true,
        nationality: true,
        driveFolderUrl: true,
        partner: { select: { name: true } },
        onboarding: { select: { englishName: true, birthDate: true } },
        dealCandidates: { select: { stage: true, deal: { select: { company: { select: { externalId: true, name: true } } } } } },
        placement: { select: { stage: true } },
      },
    }),
    prisma.duplicateMergeReview.findMany(),
    prisma.partner.findMany({ where: { id: { in: removedPartnerIds } }, select: { id: true, name: true } }),
    prisma.person.findMany({ select: { id: true, name: true, onboarding: { select: { englishName: true, birthDate: true } } } }),
  ]);

  const groups: ReviewGroup[] = MERGE_RECORDS.map((r) => {
    const p = people.find((x) => x.id === r.keptId);
    const review = reviews.find((x) => x.keptId === r.keptId);
    return {
      name: r.name,
      keptId: r.keptId,
      exists: !!p,
      kana: p?.name ?? "",
      englishName: p?.onboarding?.englishName ?? r.name,
      birthDate: p?.onboarding?.birthDate ?? null,
      nationality: p?.nationality ?? "",
      photoUrl: p?.photoUrl ?? null,
      driveFolderUrl: p?.driveFolderUrl ?? null,
      partnerName: p?.partner?.name ?? null,
      deals: (p?.dealCandidates ?? []).map((d) => `${d.deal.company.externalId ?? ""} ${d.deal.company.name}：${d.stage}`),
      placementStage: p?.placement?.stage ?? null,
      removed: r.removed.map((x) => ({
        id: x.id,
        driveUrl: x.driveUrl,
        partnerName: x.partnerId ? partners.find((pp) => pp.id === x.partnerId)?.name ?? null : null,
      })),
      moved: r.moved,
      kept: r.kept,
      review: review
        ? { status: review.status, note: review.note ?? "", reviewedBy: review.reviewedBy ?? "", updatedAt: review.updatedAt.toISOString() }
        : null,
    };
  });

  // まだ残っている重複の疑い (名前と生年月日が同じ)
  const hits = await findDuplicatePersons(all.map((p) => ({ name: p.name, englishName: p.onboarding?.englishName, birthDate: p.onboarding?.birthDate })));
  const seen = new Set<string>();
  const open: OpenPair[] = [];
  hits.forEach((list, i) => {
    for (const h of list) {
      if (h.id === all[i].id) continue;
      const key = [all[i].id, h.id].sort((a, b) => a - b).join("-");
      if (seen.has(key)) continue;
      seen.add(key);
      const a = all[i];
      open.push({
        ids: [a.id, h.id].sort((x, y) => x - y),
        name: h.englishName || h.name || a.onboarding?.englishName || a.name,
        birthDates: [a.onboarding?.birthDate ?? null, h.birthDate],
      });
    }
  });

  return (
    <div className="space-y-5 p-8">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-dark)]">重複していた候補者の確認</h1>
        <p className="mt-1 text-sm text-gray-500">
          同じ人が 2 回以上登録されていた {groups.length} 組を、ID の大きいほうにまとめました (2026/10/23)。
          中身を見て、同じ人なら「問題なし」、別人なら「別人 (戻してほしい)」を押してください。消した ID の Drive フォルダは残っています。
        </p>
      </div>
      <DuplicateReviewList groups={groups} open={open} />
    </div>
  );
}
