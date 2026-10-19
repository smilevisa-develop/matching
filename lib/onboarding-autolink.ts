/**
 * 案件ステージ「内定済み」「内定承諾」→ 内定者管理ボードの自動連携。
 *
 * これまでは候補者詳細の「進捗/日程」に手入力した人だけがボードに出ていたため、
 * 案件側で内定済みにしても管理から漏れていた (実データで 12 名漏れていた)。
 * 内定済みにした時点でボードのカードと共通タスクを自動で用意する。
 *
 * 内定承諾にしたら、内定承諾日を入れて内定後フォロー担当 (グェット) を付ける
 * (採用チームの依頼 2026/10: 内定承諾に移動すると内定後フォロー担当の部分に反映する)。
 * 紹介パートナーがいる候補者なら、そのパートナーを「実績有り」にする。
 *
 * 申請種別 (認定/変更/更新/特定活動) は内定時点では分からないことが多いので、
 * まず共通タスクだけ作り、種別が選ばれたら未完了ぶんを種別付きで作り直す
 * (app/api/onboarding/[personId] の PATCH)。
 */

import { prisma } from "./prisma";
import { buildFlowTasks, OFFER_TO_APPLICATION_DAYS, OFFER_TO_JOIN_DAYS } from "./onboarding-flow";

export const OFFER_STAGE = "内定済み";
export const OFFER_ACCEPTED_STAGE = "内定承諾";

/** 内定後フォロー担当のログインID (設定 → アカウント管理の loginId) */
export const FOLLOW_UP_OWNER_LOGIN_ID = "nguyet";

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

/** "YYYY-MM-DD" (日本時間の日付) → その日の 0 時 (JST) の Date */
function jstDate(ymd: string | null | undefined): Date | null {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  return new Date(`${ymd}T00:00:00+09:00`);
}

/**
 * ステージ変更時に呼ぶ。
 * - 内定済み: カードを用意する。既にあっても内定日が空なら入れる (進捗管理の「今月の内定」はこの日付で数える)
 * - 内定承諾: カードを用意し、内定承諾日・内定後フォロー担当 (グェット) を入れる。紹介パートナーを実績有りにする
 * @param dateYmd カンバンで入力した日付 ("YYYY-MM-DD")。無ければ今日
 */
export async function onDealCandidateStageChanged(personId: number, stage: string, dateYmd?: string | null) {
  if (stage !== OFFER_STAGE && stage !== OFFER_ACCEPTED_STAGE) return { created: false };
  const date = jstDate(dateYmd) ?? new Date();
  const result = await ensureOnboardingCard(personId, date);
  if (!result.created && stage === OFFER_STAGE) {
    await prisma.personPlacement.updateMany({ where: { personId, offerAt: null }, data: { offerAt: date } });
  }

  if (stage === OFFER_ACCEPTED_STAGE) {
    const owner = await prisma.staffAccount.findUnique({
      where: { loginId: FOLLOW_UP_OWNER_LOGIN_ID },
      select: { id: true },
    });
    const current = await prisma.personPlacement.findUnique({
      where: { personId },
      select: { offerAt: true, followUpOwnerId: true, applicationPlannedAt: true, joinPlannedAt: true },
    });
    await prisma.personPlacement.update({
      where: { personId },
      data: {
        offerAcceptedAt: date,
        offerAt: current?.offerAt ?? date,
        // 担当がまだ無ければ内定後フォロー担当を付ける (手で変えた担当は上書きしない)
        followUpOwnerId: current?.followUpOwnerId ?? owner?.id ?? null,
        applicationPlannedAt:
          current?.applicationPlannedAt ?? new Date(date.getTime() + OFFER_TO_APPLICATION_DAYS * 86_400_000),
        joinPlannedAt: current?.joinPlannedAt ?? new Date(date.getTime() + OFFER_TO_JOIN_DAYS * 86_400_000),
      },
    });

    // 紹介パートナーの実績に反映する
    const person = await prisma.person.findUnique({
      where: { id: personId },
      select: { partner: { select: { id: true, relationshipStatus: true } } },
    });
    if (person?.partner) {
      const rel = (person.partner.relationshipStatus ?? "").trim();
      await prisma.partner.update({
        where: { id: person.partner.id },
        data: {
          hasPerformance: true,
          // 「有料 / 無料」など別の関係性ラベルが入っていれば残す
          ...(rel === "" || rel === "実績無し" ? { relationshipStatus: "実績有り" } : {}),
        },
      });
    }
  }
  return result;
}
