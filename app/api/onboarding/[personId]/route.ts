/**
 * 内定後管理ボードの 1 枚のカード (= 1 人の内定者) を操作する (要ログイン)。
 *
 * PATCH /api/onboarding/[personId]   ステージ / 次アクション / 期限 / 主要日付の更新
 * POST  /api/onboarding/[personId]   body.action:
 *        "createTasks" … 標準チェックリストを作成 (既にあれば何もしない)
 *        "addTask"     … タスクを 1 件追加 { category, title, dueAt }
 *        "addIssue"    … 問題を 1 件記録 { title, detail }
 */

import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";
import {
  buildFlowTasks,
  HOLD_STAGE,
  OFFER_TO_APPLICATION_DAYS,
  OFFER_TO_JOIN_DAYS,
  ONBOARDING_STAGES,
  resolveStage,
} from "@/lib/onboarding-flow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_FIELDS = [
  "offerAcceptedAt",
  "applicationPlannedAt",
  "applicationAt",
  "applicationResultAt",
  "entryPlannedAt",
  "entryAt",
  "joinPlannedAt",
  "joinAt",
  "nextActionDueAt",
] as const;

function parseDate(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** 候補者の内定後レコードを用意する (無ければ作る) */
async function ensurePlacement(personId: number) {
  const existing = await prisma.personPlacement.findUnique({ where: { personId } });
  if (existing) return existing;
  return prisma.personPlacement.create({ data: { personId } });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ personId: string }> }) {
  try {
    await requireApiAccount();
    const { personId: raw } = await params;
    const personId = Number(raw);
    if (!Number.isFinite(personId)) {
      return Response.json({ ok: false, error: "personId が不正です" }, { status: 400 });
    }
    const body = await req.json();
    const placement = await ensurePlacement(personId);

    const data: Record<string, unknown> = {};
    if (typeof body.stage === "string" && ONBOARDING_STAGES.some((s) => s.id === body.stage)) {
      const current = resolveStage(placement);
      data.stage = body.stage;
      data.stageChangedAt = new Date();
      if (body.stage === HOLD_STAGE) {
        // 保留にするときは、戻す先として今の工程を覚えておく
        if (current !== HOLD_STAGE) data.heldFromStage = current;
        if (typeof body.holdReason === "string") data.holdReason = body.holdReason.trim() || null;
      } else {
        data.heldFromStage = null;
        data.holdReason = null;
      }
    }
    if (body.holdReason !== undefined && data.holdReason === undefined) {
      data.holdReason = typeof body.holdReason === "string" && body.holdReason.trim()
        ? body.holdReason.trim()
        : null;
    }
    if (body.applicationType !== undefined) {
      data.applicationType = typeof body.applicationType === "string" && body.applicationType.trim()
        ? body.applicationType.trim()
        : null;
    }
    if (body.followUpOwnerId !== undefined) {
      const id = Number(body.followUpOwnerId);
      data.followUpOwnerId = Number.isFinite(id) && id > 0 ? id : null;
    }
    if (body.currentAction !== undefined) {
      data.currentAction = typeof body.currentAction === "string" && body.currentAction.trim()
        ? body.currentAction.trim()
        : null;
    }
    for (const field of DATE_FIELDS) {
      const parsed = parseDate(body[field]);
      if (parsed !== undefined) data[field] = parsed;
    }
    const updated = await prisma.personPlacement.update({ where: { id: placement.id }, data });

    // 申請種別が変わったら、未完了タスクをその種別の内容で作り直す
    // (完了済みは残す。種別が決まるまでは共通タスクだけが入っている状態)
    let rebuiltTasks = false;
    if (data.applicationType !== undefined && data.applicationType !== placement.applicationType) {
      await prisma.placementTask.deleteMany({ where: { placementId: placement.id, doneAt: null } });
      const base = updated.offerAcceptedAt ?? updated.offerAt ?? null;
      const doneTitles = new Set(
        (
          await prisma.placementTask.findMany({
            where: { placementId: placement.id },
            select: { title: true },
          })
        ).map((t) => t.title),
      );
      const tasks = buildFlowTasks(updated.applicationType, base).filter(
        (t) => !doneTitles.has(t.title),
      );
      if (tasks.length > 0) {
        await prisma.placementTask.createMany({
          data: tasks.map((t) => ({ ...t, placementId: placement.id })),
        });
      }
      rebuiltTasks = true;
    }

    const tasks = rebuiltTasks
      ? await prisma.placementTask.findMany({
          where: { placementId: placement.id },
          orderBy: { sortOrder: "asc" },
        })
      : undefined;
    return Response.json({ ok: true, placement: updated, rebuiltTasks, tasks });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 },
    );
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ personId: string }> }) {
  try {
    const account = await requireApiAccount();
    const { personId: raw } = await params;
    const personId = Number(raw);
    if (!Number.isFinite(personId)) {
      return Response.json({ ok: false, error: "personId が不正です" }, { status: 400 });
    }
    const body = await req.json();
    const placement = await ensurePlacement(personId);

    if (body.action === "createTasks") {
      const already = await prisma.placementTask.count({ where: { placementId: placement.id } });
      if (already > 0 && !body.replace) {
        return Response.json({ ok: true, created: 0, note: "既にチェックリストがあります" });
      }
      if (body.replace) {
        // 申請種別を選び直したとき: 未完了のタスクだけ入れ替える (完了済みは残す)
        await prisma.placementTask.deleteMany({ where: { placementId: placement.id, doneAt: null } });
      }
      const base = placement.offerAcceptedAt ?? placement.offerAt ?? placement.createdAt;
      // 川村さんの指示: 申請予定日 = 内定受領 +10日 / 就業開始予定日 = 内定受領 +2か月
      await prisma.personPlacement.update({
        where: { id: placement.id },
        data: {
          applicationPlannedAt:
            placement.applicationPlannedAt ??
            new Date(base.getTime() + OFFER_TO_APPLICATION_DAYS * 86_400_000),
          joinPlannedAt:
            placement.joinPlannedAt ?? new Date(base.getTime() + OFFER_TO_JOIN_DAYS * 86_400_000),
        },
      });
      const tasks = buildFlowTasks(
        typeof body.applicationType === "string" ? body.applicationType : placement.applicationType,
        base,
      );
      await prisma.placementTask.createMany({
        data: tasks.map((t) => ({ ...t, placementId: placement.id })),
      });
      const created = await prisma.placementTask.findMany({
        where: { placementId: placement.id },
        orderBy: { sortOrder: "asc" },
      });
      return Response.json({ ok: true, created: created.length, tasks: created });
    }

    if (body.action === "addTask") {
      const title = String(body.title ?? "").trim();
      if (!title) return Response.json({ ok: false, error: "タスク名を入力してください" }, { status: 400 });
      const max = await prisma.placementTask.aggregate({
        where: { placementId: placement.id },
        _max: { sortOrder: true },
      });
      const task = await prisma.placementTask.create({
        data: {
          placementId: placement.id,
          category: String(body.category ?? "その他"),
          title,
          dueAt: parseDate(body.dueAt) ?? null,
          sortOrder: (max._max.sortOrder ?? 0) + 1,
        },
      });
      return Response.json({ ok: true, task });
    }

    if (body.action === "addIssue") {
      const title = String(body.title ?? "").trim();
      if (!title) return Response.json({ ok: false, error: "問題の内容を入力してください" }, { status: 400 });
      const issue = await prisma.placementIssue.create({
        data: {
          placementId: placement.id,
          title,
          detail: typeof body.detail === "string" && body.detail.trim() ? body.detail.trim() : null,
          recordedBy: account.name ?? account.loginId ?? null,
        },
      });
      return Response.json({ ok: true, issue });
    }

    return Response.json({ ok: false, error: "action が不正です" }, { status: 400 });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 },
    );
  }
}
