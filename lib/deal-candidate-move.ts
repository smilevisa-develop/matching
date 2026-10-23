/**
 * カンバンで候補者のステージを動かす (人数カウンター・ステージの日付も一緒に直す)。
 * /api/deal-candidates/[id] の PATCH と、内定者管理で「内定辞退」に入れたときの両方から使う。
 * スプシ反映・内定者ボード連携などの後処理は呼び出し元で行う。
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import {
  isAgencyKind,
  progressStagesForKind,
  readFilledStages,
  readStageDates,
  stageCounterDeltas,
  type CounterField,
} from "@/lib/deal-stages";

export async function moveDealCandidateStage(id: number, stage: string, date: string, note?: string | null) {
  // ステージの移動に合わせて人数カウンターも動かす (カンバンと数字を常に揃えるため)。
  // 同時に動かされても二重に数えないよう、前のステージの読み取りから更新までを 1 つにまとめる。
  return prisma.$transaction(async (tx) => {
    const before = await tx.dealCandidate.findUniqueOrThrow({
      where: { id },
      select: { stage: true, dealId: true, stageDates: true, deal: { select: { company: { select: { companyKind: true } } } } },
    });
    const kind = before.deal.company.companyKind;
    const progress = progressStagesForKind(kind);
    // ステージごとの日付を記録する (同じステージに留まるときは触らない)。
    // 途中を飛ばして進めたとき (事前面談済み → 内定済み など) は、飛ばした段階にも同じ日付を入れる
    // (人数カウンターと同じく「通過した」扱い。月別集計で漏れないようにする)
    const stageDates: Record<string, unknown> = readStageDates(before.stageDates);
    const filled = readFilledStages(before.stageDates);
    if (before.stage !== stage) {
      const from = progress.indexOf(before.stage);
      const to = progress.indexOf(stage);
      if (from >= 0 && to > from) {
        for (let i = from + 1; i < to; i++) {
          const skipped = progress[i];
          if (!stageDates[skipped]) {
            stageDates[skipped] = date;
            filled.add(skipped);
          }
        }
      }
      stageDates[stage] = date;
      filled.delete(stage);
    }
    // 自動で埋めた段階の印 (日数の計算から外すため)
    if (filled.size > 0) stageDates._filled = [...filled];
    const candidate = await tx.dealCandidate.update({
      where: { id },
      data: {
        stage,
        stageDates: stageDates as Prisma.InputJsonValue,
        ...(note !== undefined ? { note } : {}),
      },
    });
    const deltas = Object.entries(stageCounterDeltas(before.stage, stage)).filter(([, n]) => n !== 0) as [CounterField, number][];
    const select = {
      recommendedCount: true,
      interviewCount: true,
      offerCount: true,
      declineCount: true,
      rejectCount: true,
    };
    const current = await tx.deal.findUniqueOrThrow({ where: { id: before.dealId }, select });
    const common = { candidate, stageChanged: before.stage !== stage, agency: isAgencyKind(kind), fromStage: before.stage };
    if (deltas.length === 0) return { ...common, counters: current };
    const counters = await tx.deal.update({
      where: { id: before.dealId },
      // 手で直した結果より多く戻されても 0 未満にはしない
      data: Object.fromEntries(deltas.map(([field, n]) => [field, Math.max(0, current[field] + n)])),
      select,
    });
    return { ...common, counters };
  });
}
