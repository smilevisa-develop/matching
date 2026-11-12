/**
 * 内定後チェックリストの 1 タスクを更新 / 削除する (要ログイン)。
 *
 * PATCH  /api/onboarding/tasks/[taskId]   { done?: boolean, dueAt?: string|null, note?: string }
 * DELETE /api/onboarding/tasks/[taskId]
 */

import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";
import { billingPatchForStep, writeBillingToSheet, type LedgerStepKey } from "@/lib/billing-ledger";

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
    // 請求のタスクを終えた / 取り消したら、請求 (アプリ) の状況を合わせ、企業データベースの請求管理に書く
    const ledgerStep: Record<string, LedgerStepKey> = { invoice: "invoice", payment: "payment", "pa-invoice": "partnerInvoice", "pa-payment": "partnerPayment" };
    const step = task.billingStep ? ledgerStep[task.billingStep] : undefined;
    if (typeof body.done === "boolean" && step && task.placement.personId) {
      const personId = task.placement.personId;
      const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
      const current = await prisma.personBilling.findUnique({ where: { personId } });
      const data = billingPatchForStep(step, body.done, today, current);
      await prisma.personBilling.upsert({
        where: { personId },
        create: { personId, ...data, updatedBy: account.name ?? null },
        update: { ...data, updatedBy: account.name ?? null },
      });
      after(async () => {
        const r = await writeBillingToSheet([personId]);
        if (r.error) console.warn("請求管理への反映に失敗:", r.error);
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
