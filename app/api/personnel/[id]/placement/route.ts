/**
 * 候補者詳細「請求」タブの「進捗 / 日程」(内定承諾より前の日程と申請) を保存する。
 *
 * 内定承諾より前の日付だけなら、内定者管理ボードに出ないレコード (stage = "pre") に入れる。
 * 内定承諾日を入れたら、カンバンで内定承諾にしたときと同じく内定者管理にカードを作る (担当はグェット)。
 * 一時帰国より後 (一時帰国・入国・入社) は内定者管理のカードで入れる。
 */

import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";
import { PRE_OFFER_STAGE } from "@/lib/onboarding-flow";
import { ensureOnboardingCard, onDealCandidateStageChanged, rebuildFlowTasksForType } from "@/lib/onboarding-autolink";

type Params = Promise<{ id: string }>;

const DATE_FIELDS = [
  "acceptedAt",
  "preInterviewAt",
  "companyInterviewAt",
  "offerAt",
  "offerAcceptedAt",
  "applicationPlannedAt",
  "applicationAt",
  "applicationResultAt",
  "returnHomeAt",
  "entryPlannedAt",
  "entryAt",
  "joinPlannedAt",
  "joinAt",
] as const;

/** 内定承諾より後の日付 (入れたらボードのカードを用意する) */
const CARD_DATE_FIELDS = ["applicationPlannedAt", "applicationAt", "applicationResultAt"] as const;

/** 「YYYY-MM-DD」は日本時間の 0 時として保存する (内定者管理と同じ) */
function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const v = String(value);
  const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00+09:00`) : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

const TEXT_FIELDS = [
  "applicationType",
  "applicantName",
  "returnHomeFlag",
  "sixMonthStatus",
  "consultation",
  "currentAction",
] as const;

export async function GET(_: Request, { params }: { params: Params }) {
  try {
    await requireApiAccount();
    const { id } = await params;
    const placement = await prisma.personPlacement.findUnique({ where: { personId: Number(id) } });
    return Response.json({ ok: true, placement });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 }
    );
  }
}

export async function PATCH(req: Request, { params }: { params: Params }) {
  try {
    await requireApiAccount();
    const { id } = await params;
    const personId = Number(id);
    const body = await req.json();

    const createData: Record<string, unknown> = { personId };
    const updateData: Record<string, unknown> = {};
    for (const field of DATE_FIELDS) {
      if (body[field] !== undefined) {
        const value = parseDate(body[field]);
        createData[field] = value;
        updateData[field] = value;
      }
    }
    for (const field of TEXT_FIELDS) {
      if (body[field] !== undefined) {
        const value = body[field] ? String(body[field]) : null;
        createData[field] = value;
        updateData[field] = value;
      }
    }

    // 内定承諾日を入れた → カンバンで内定承諾にしたときと同じ手順でカードを作る (担当・申請予定日なども入る)
    // 申請などを入れた → カードが無ければ用意する
    const before = await prisma.personPlacement.findUnique({ where: { personId }, select: { stage: true, offerAt: true, applicationType: true } });
    const accepted = typeof body.offerAcceptedAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.offerAcceptedAt) ? body.offerAcceptedAt : null;
    if (accepted && (!before || before.stage === PRE_OFFER_STAGE)) {
      await onDealCandidateStageChanged(personId, "内定承諾", accepted);
    } else if (CARD_DATE_FIELDS.some((f) => body[f]) && (!before || before.stage === PRE_OFFER_STAGE)) {
      await ensureOnboardingCard(personId, updateData.offerAt instanceof Date ? updateData.offerAt : (before?.offerAt ?? null));
    }
    createData.stage = PRE_OFFER_STAGE;

    const placement = await prisma.personPlacement.upsert({
      where: { personId },
      create: createData as never,
      update: updateData as never,
    });
    // ボードのカードで申請種別が変わったら、タスクをその種別の内容で作り直す (内定者管理で変えたときと同じ)
    if (
      updateData.applicationType !== undefined &&
      updateData.applicationType !== (before?.applicationType ?? null) &&
      placement.stage !== PRE_OFFER_STAGE
    ) {
      await rebuildFlowTasksForType(placement.id);
    }

    return Response.json({ ok: true, placement });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 }
    );
  }
}
