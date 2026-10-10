/**
 * 案件ステージ「内定済み」→ 内定者管理ボードの自動連携。
 *
 * これまでは候補者詳細の「進捗/日程」に手入力した人だけがボードに出ていたため、
 * 案件側で内定済みにしても管理から漏れていた (実データで 12 名漏れていた)。
 * 内定済みにした時点でボードのカードと共通タスクを自動で用意する。
 *
 * 申請種別 (認定/変更/更新/特定活動) は内定時点では分からないことが多いので、
 * まず共通タスクだけ作り、種別が選ばれたら未完了ぶんを種別付きで作り直す
 * (app/api/onboarding/[personId] の PATCH)。
 */

import { prisma } from "./prisma";
import { buildFlowTasks, OFFER_TO_APPLICATION_DAYS, OFFER_TO_JOIN_DAYS } from "./onboarding-flow";

export const OFFER_STAGE = "内定済み";

/**
 * 内定者管理ボードにカードを用意する (既にあれば何もしない)。
 * @param baseDate 期限計算の基準日。null なら期限なしで作る (後から入れれば再計算できる)
 */
export async function ensureOnboardingCard(personId: number, baseDate: Date | null) {
  const existing = await prisma.personPlacement.findUnique({
    where: { personId },
    select: { id: true },
  });
  if (existing) return { created: false, placementId: existing.id };

  const placement = await prisma.personPlacement.create({
    data: {
      personId,
      stage: "offer",
      stageChangedAt: new Date(),
      offerAt: baseDate,
      // 川村さんの指示: 申請予定日 = 内定受領 +10日 / 入社予定日 = 内定受領 +2か月
      applicationPlannedAt: baseDate
        ? new Date(baseDate.getTime() + OFFER_TO_APPLICATION_DAYS * 86_400_000)
        : null,
      joinPlannedAt: baseDate
        ? new Date(baseDate.getTime() + OFFER_TO_JOIN_DAYS * 86_400_000)
        : null,
    },
  });

  // 申請種別はまだ分からないので、全員共通のタスクだけ入れておく
  const tasks = buildFlowTasks(null, baseDate);
  if (tasks.length > 0) {
    await prisma.placementTask.createMany({
      data: tasks.map((t) => ({ ...t, placementId: placement.id })),
    });
  }
  return { created: true, placementId: placement.id };
}

/** ステージ変更時に呼ぶ。内定済みになったときだけカードを用意する */
export async function onDealCandidateStageChanged(personId: number, stage: string) {
  if (stage !== OFFER_STAGE) return { created: false };
  return ensureOnboardingCard(personId, new Date());
}
