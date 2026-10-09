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
import { buildOnboardingTasks } from "@/lib/onboarding-tasks";

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
    if (typeof body.stage === "string") data.stage = body.stage;
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
    return Response.json({ ok: true, placement: updated });
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
      if (already > 0) {
        return Response.json({ ok: true, created: 0, note: "既にチェックリストがあります" });
      }
      const tasks = buildOnboardingTasks(placement.offerAcceptedAt ?? placement.offerAt ?? null);
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
