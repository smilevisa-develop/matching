/**
 * 内定後チェックリストの 1 タスクを更新 / 削除する (要ログイン)。
 *
 * PATCH  /api/onboarding/tasks/[taskId]   { done?: boolean, dueAt?: string|null, note?: string }
 * DELETE /api/onboarding/tasks/[taskId]
 */

import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";
import { writeBillingStepToSheet } from "@/lib/billing-sheet";
import type { BillingStepKey } from "@/lib/billing-flow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const account = await requireApiAccount();
    const { taskId: raw } = await params;
    const taskId = Number(raw);
    if (!Number.isFinite(taskId)) {
      return Response.json({ ok: false, error: "taskId が不正です" }, { status: 400 });
    }
    const body = await req.json();
    const data: Record<string, unknown> = {};
    if (typeof body.done === "boolean") {
      data.doneAt = body.done ? new Date() : null;
      data.doneBy = body.done ? (account.name ?? account.loginId ?? null) : null;
    }
    if (body.dueAt !== undefined) {
      const d = body.dueAt ? new Date(String(body.dueAt)) : null;
      data.dueAt = d && !Number.isNaN(d.getTime()) ? d : null;
    }
    if (body.note !== undefined) {
      data.note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;
    }
    const task = await prisma.placementTask.update({
      where: { id: taskId },
      data,
      include: { placement: { select: { personId: true } } },
    });
    // 請求のタスクを終えたら、企業データベースの請求管理に請求日・入金済・支払済などを書く
    if (body.done === true && task.billingStep && task.placement.personId) {
      const personId = task.placement.personId;
      const ymd = (d: Date) => new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
      after(async () => {
        try {
          const r = await writeBillingStepToSheet({
            personId,
            step: task.billingStep as BillingStepKey,
            doneYmd: ymd(task.doneAt ?? new Date()),
            dueYmd: task.dueAt ? ymd(task.dueAt) : null,
          });
          if (!r.ok) console.info("請求管理への反映をスキップ:", r.reason);
        } catch (e) {
          console.warn("請求管理への反映に失敗:", e instanceof Error ? e.message : e);
        }
      });
    }
    return Response.json({ ok: true, task });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 },
    );
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    await requireApiAccount();
    const { taskId: raw } = await params;
    const taskId = Number(raw);
    if (!Number.isFinite(taskId)) {
      return Response.json({ ok: false, error: "taskId が不正です" }, { status: 400 });
    }
    await prisma.placementTask.delete({ where: { id: taskId } });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 },
    );
  }
}
