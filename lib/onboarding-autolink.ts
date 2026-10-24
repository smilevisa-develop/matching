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
export const JOIN_WAITING_STAGE = "入社待ち";
export const JOINED_STAGE = "入社済み";

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
 * - 内定済み: カードは作らない。既にあれば内定日だけ入れる (進捗管理の「今月の内定」はこの日付で数える)
 * - 内定承諾: ボードにカードを作り、内定承諾日・内定後フォロー担当 (グェット) を入れる。紹介パートナーを実績有りにする
 * @param dateYmd カンバンで入力した日付 ("YYYY-MM-DD")。無ければ今日
 */
export async function onDealCandidateStageChanged(personId: number, stage: string, dateYmd?: string | null): Promise<{ created: boolean }> {
  if (stage === JOIN_WAITING_STAGE || stage === JOINED_STAGE) return onJoinStage(personId, stage, dateYmd);
  if (stage !== OFFER_STAGE && stage !== OFFER_ACCEPTED_STAGE) return { created: false };
  const date = jstDate(dateYmd) ?? new Date();

  // 内定済み: ボードのカードはまだ作らない (内定承諾で作る。2026/10 採用チームの指示)。
  // 既にカードがあれば内定日だけ入れる
  if (stage === OFFER_STAGE) {
    await prisma.personPlacement.updateMany({ where: { personId, offerAt: null }, data: { offerAt: date } });
    return { created: false };
  }

  const result = await ensureOnboardingCard(personId, date);
  if (stage === OFFER_ACCEPTED_STAGE) {
    const owner = await prisma.staffAccount.findUnique({
      where: { loginId: FOLLOW_UP_OWNER_LOGIN_ID },
      select: { id: true },
    });
    const current = await prisma.personPlacement.findUnique({
      where: { personId },
      select: { offerAt: true, followUpOwnerId: true, applicationPlannedAt: true, joinPlannedAt: true, stage: true },
    });
    // 内定辞退でボードから消していた人を、また内定承諾にしたらボードに戻す
    if (current?.stage === "declined") {
      await prisma.personPlacement.update({
        where: { personId },
        data: { stage: "offer", stageChangedAt: new Date(), declineReason: null },
      });
    }
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

/** 内定が出た扱いのステージ (ここから外れたら自動で作ったカードを片付ける) */
const OFFERED_STAGES = new Set(["内定済み", "内定承諾", "入社待ち", "入社済み", "内定辞退", "内定取り消し"]);

export function isOfferedStage(stage: string | null | undefined) {
  return OFFERED_STAGES.has(stage ?? "");
}

/**
 * 間違えて内定承諾にした候補者をカンバンから外した / 内定より前に戻したときの片付け。
 * ほかの求人でも内定が出ていなければ、自動で作った内定者管理のカードを消す。
 * ただし誰かが手を付けたカード (タスク完了・問題の記録・申請日・工程を進めた) は残す。
 */
export async function removeUntouchedOnboardingCard(personId: number): Promise<{ removed: boolean; reason?: string }> {
  const stillOffered = await prisma.dealCandidate.count({
    where: { personId, stage: { in: [...OFFERED_STAGES] } },
  });
  if (stillOffered > 0) return { removed: false, reason: "ほかの求人で内定が出ている" };
  const placement = await prisma.personPlacement.findUnique({
    where: { personId },
    select: {
      id: true,
      stage: true,
      applicationAt: true,
      applicationType: true,
      currentAction: true,
      _count: { select: { issues: true, tasks: { where: { doneAt: { not: null } } } } },
    },
  });
  if (!placement) return { removed: false, reason: "カードが無い" };
  const touched =
    (placement.stage && placement.stage !== "offer") ||
    placement.applicationAt ||
    placement.applicationType ||
    placement.currentAction ||
    placement._count.issues > 0 ||
    placement._count.tasks > 0;
  if (touched) return { removed: false, reason: "手を付けたカードなので残す" };
  await prisma.personPlacement.delete({ where: { id: placement.id } });
  return { removed: true };
}

/**
 * カンバンで「入社待ち」「入社済み」にしたときの日付を、内定者カードにも入れる。
 * - 入社待ち: 入社予定日
 * - 入社済み: 入社日 (カードの工程も「入社・請求」まで進める。戻しはしない)
 * 内定承諾を飛ばしてここまで動かした人はカードが無いので、先に内定承諾と同じ手順でカードを作る。
 */
async function onJoinStage(personId: number, stage: string, dateYmd?: string | null): Promise<{ created: boolean }> {
  const date = jstDate(dateYmd) ?? new Date();
  const existing = await prisma.personPlacement.findUnique({ where: { personId }, select: { id: true } });
  const created: { created: boolean } = existing ? { created: false } : await onDealCandidateStageChanged(personId, OFFER_ACCEPTED_STAGE, dateYmd);
  const card = await prisma.personPlacement.findUnique({ where: { personId }, select: { stage: true } });
  if (!card) return created;
  if (stage === JOIN_WAITING_STAGE) {
    await prisma.personPlacement.update({ where: { personId }, data: { joinPlannedAt: date } });
  } else {
    // 保留・キャンセル・内定辞退のカードは工程を動かさない (日付だけ入れる)
    const movable = !["hold", "card_cancelled", "declined", "joined"].includes(card.stage ?? "");
    await prisma.personPlacement.update({
      where: { personId },
      data: { joinAt: date, ...(movable ? { stage: "joined", stageChangedAt: new Date() } : {}) },
    });
  }
  return created;
}
