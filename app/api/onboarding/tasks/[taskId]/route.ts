/**
 * 内定後チェックリストの 1 タスクを更新 / 削除する (要ログイン)。
 *
 * PATCH  /api/onboarding/tasks/[taskId]   { done?: boolean, dueAt?: string|null, note?: string }
 * DELETE /api/onboarding/tasks/[taskId]
 */

import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";

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
    const task = await prisma.placementTask.update({ where: { id: taskId }, data });
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
