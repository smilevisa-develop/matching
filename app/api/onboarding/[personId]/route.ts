/**
 * 内定後管理ボードの 1 枚のカード (= 1 人の内定者) を操作する (要ログイン)。
 *
 * URL の id は 2 通り:
 *   /api/onboarding/123     候補者ID (従来)
 *   /api/onboarding/p45     内定者レコード (PersonPlacement) の id。候補者に紐づかない内定者はこちらだけ
 *
 * PATCH  ステージ / 担当 / メモ / 保留理由 / キャンセル理由 / 内定辞退の理由 / 申請方法 / 主要日付 / 申請種別 の更新
 * DELETE 間違えて追加したカードを消す (チェックリスト・問題記録も消える。候補者本体とカンバンは残る)
 * POST   body.action:
 *        "createTasks"   … 標準チェックリストを作成 (replace で未完了を入れ替え)
 *        "addTask"       … タスクを 1 件追加 { category, title }
 *        "addIssue"      … 問題を 1 件記録 { title, detail }
 *        "completeStage" … その工程のタスクを一括で完了 { stage } (undo: true で全部戻す)
 *        "setSupports"   … サポート工程で必要な支援を選ぶ { supports: string[] } → その分のタスクに入れ替える
 *        "ensureFolder"  … 内定者の Drive フォルダ (企業フォルダ / 内定者 / 英語名) を用意して URL を返す
 */

import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { moveDealCandidateStage } from "@/lib/deal-candidate-move";
import { ensurePlacementFolder } from "@/lib/placement-folder";
import { rebuildFlowTasksForType } from "@/lib/onboarding-autolink";
import { BILLING_STAGE, ensureBillingTasks } from "@/lib/billing-flow";
import { todayJst } from "@/lib/deal-stages";
import { requestCompanyDatabaseSync } from "@/lib/company-db-sync";
import { requestKpiSheetSync } from "@/lib/kpi-sheet-sync";
import { AuthError, requireApiAccount } from "@/lib/auth";
import {
  buildFlowTasks,
  buildSupportTasks,
  DECLINED_STAGE,
  HOLD_STAGE,
  OFFER_TO_APPLICATION_DAYS,
  OFFER_TO_JOIN_DAYS,
  ONBOARDING_STAGES,
  readSupports,
  resolveStage,
  stageOfPhase,
  SUPPORT_PHASES,
  type OnboardingStageId,
} from "@/lib/onboarding-flow";

export const runtime = "nodejs";

/** キャンセルの工程 (理由を入れる) */
const CANCEL_STAGE = "card_cancelled";
export const dynamic = "force-dynamic";

const DATE_FIELDS = [
  "offerAcceptedAt",
  "returnHomeAt",
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
  const v = String(value);
  // 「YYYY-MM-DD」は日本時間の 0 時として保存する (表示・月の集計も日本時間で行うため)
  const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00+09:00`) : new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

const str = (v: unknown): string | null | undefined =>
  v === undefined ? undefined : typeof v === "string" && v.trim() ? v.trim() : null;

/** URL の id からレコードを用意する (候補者IDなら無ければ作る) */
async function resolvePlacement(raw: string) {
  if (/^p\d+$/.test(raw)) {
    const id = Number(raw.slice(1));
    const found = await prisma.personPlacement.findUnique({ where: { id } });
    if (!found) throw new Error("内定者が見つかりません");
    return found;
  }
  const personId = Number(raw);
  if (!Number.isFinite(personId)) throw new Error("id が不正です");
  const existing = await prisma.personPlacement.findUnique({ where: { personId } });
  if (existing) return existing;
  return prisma.personPlacement.create({ data: { personId } });
}

const listTasks = (placementId: number) =>
  prisma.placementTask.findMany({ where: { placementId }, orderBy: { sortOrder: "asc" } });

export async function PATCH(req: Request, { params }: { params: Promise<{ personId: string }> }) {
  try {
    await requireApiAccount();
    const { personId: raw } = await params;
    const body = await req.json();
    const placement = await resolvePlacement(raw);

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
      // キャンセルに入れるときは理由も一緒に保存する (列から出しても記録として残す)
      if (body.stage === CANCEL_STAGE && typeof body.cancelReason === "string") data.cancelReason = body.cancelReason.trim() || null;
      if (body.stage === DECLINED_STAGE && typeof body.declineReason === "string") data.declineReason = body.declineReason.trim() || null;
    }
    if (body.cancelReason !== undefined && data.cancelReason === undefined) data.cancelReason = str(body.cancelReason);
    if (body.holdReason !== undefined && data.holdReason === undefined) data.holdReason = str(body.holdReason);
    if (body.applicationType !== undefined) data.applicationType = str(body.applicationType);
    if (body.applicationMethod !== undefined) data.applicationMethod = str(body.applicationMethod);
    if (body.returnHomeFlag !== undefined) data.returnHomeFlag = str(body.returnHomeFlag);
    if (typeof body.documentsOnly === "boolean") data.documentsOnly = body.documentsOnly;
    if (body.externalName !== undefined && !placement.personId) data.externalName = str(body.externalName);
    if (body.externalCompanyName !== undefined && !placement.personId) data.externalCompanyName = str(body.externalCompanyName);
    if (body.externalResidenceStatus !== undefined && !placement.personId) data.externalResidenceStatus = str(body.externalResidenceStatus);
    if (body.followUpOwnerId !== undefined) {
      const id = Number(body.followUpOwnerId);
      data.followUpOwnerId = Number.isFinite(id) && id > 0 ? id : null;
    }
    if (body.currentAction !== undefined) data.currentAction = str(body.currentAction);
    for (const field of DATE_FIELDS) {
      const parsed = parseDate(body[field]);
      if (parsed !== undefined) data[field] = parsed;
    }
    const updated = await prisma.personPlacement.update({ where: { id: placement.id }, data });

    // 内定辞退にしたら、カンバンの候補者 (内定済み・内定承諾・入社待ち) も「内定辞退」にする (内定辞退の人数も 1 増える)
    if (data.stage === DECLINED_STAGE && placement.personId) {
      const links = await prisma.dealCandidate.findMany({
        where: { personId: placement.personId, stage: { in: ["内定済み", "内定承諾", "入社待ち"] } },
        select: { id: true },
      });
      const today = todayJst();
      for (const link of links) await moveDealCandidateStage(link.id, "内定辞退", today);
      if (links.length > 0) {
        after(() => requestCompanyDatabaseSync());
        after(() => requestKpiSheetSync());
      }
    }

    // 申請種別が変わったら、未完了タスクをその種別の内容で作り直す (完了済みは残す)
    let rebuiltTasks = false;
    if (data.applicationType !== undefined && data.applicationType !== placement.applicationType) {
      await rebuildFlowTasksForType(placement.id);
      rebuiltTasks = true;
    }

    // 請求の列に入れたとき / 請求の列で入社日を変えたときは、入社日から請求のタスク (翌月 1 日に請求 …) を作る
    const nowBilling = (updated.stage ?? "") === BILLING_STAGE;
    if (nowBilling && (data.stage === BILLING_STAGE || data.joinAt !== undefined)) {
      const r = await ensureBillingTasks(placement.id);
      if (r.created > 0) rebuiltTasks = true;
    }

    const tasks = rebuiltTasks ? await listTasks(placement.id) : undefined;
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
    const body = await req.json();
    const placement = await resolvePlacement(raw);

    if (body.action === "ensureFolder") {
      const r = await ensurePlacementFolder(placement.id);
      if (!r.folderUrl) return Response.json({ ok: false, error: r.reason ?? "フォルダを用意できませんでした" }, { status: 400 });
      return Response.json({ ok: true, folderUrl: r.folderUrl });
    }

    if (body.action === "createTasks") {
      const already = await prisma.placementTask.count({ where: { placementId: placement.id } });
      if (already > 0 && !body.replace) {
        return Response.json({ ok: true, created: 0, note: "既にチェックリストがあります" });
      }
      if (body.replace) {
        await prisma.placementTask.deleteMany({ where: { placementId: placement.id, doneAt: null } });
      }
      const base = placement.offerAcceptedAt ?? placement.offerAt ?? placement.createdAt;
      await prisma.personPlacement.update({
        where: { id: placement.id },
        data: {
          applicationType: typeof body.applicationType === "string" ? body.applicationType : placement.applicationType,
          applicationPlannedAt:
            placement.applicationPlannedAt ?? new Date(base.getTime() + OFFER_TO_APPLICATION_DAYS * 86_400_000),
          joinPlannedAt: placement.joinPlannedAt ?? new Date(base.getTime() + OFFER_TO_JOIN_DAYS * 86_400_000),
        },
      });
      const tasks = buildFlowTasks(
        typeof body.applicationType === "string" ? body.applicationType : placement.applicationType,
        base,
      );
      await prisma.placementTask.createMany({ data: tasks.map((t) => ({ ...t, placementId: placement.id })) });
      const created = await listTasks(placement.id);
      return Response.json({ ok: true, created: created.length, tasks: created });
    }

    if (body.action === "addTask") {
      const title = String(body.title ?? "").trim();
      if (!title) return Response.json({ ok: false, error: "タスク名を入力してください" }, { status: 400 });
      const max = await prisma.placementTask.aggregate({ where: { placementId: placement.id }, _max: { sortOrder: true } });
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

    if (body.action === "completeStage") {
      // 工程のタスクを一括で完了 (不要な人は工程ごとチェックして進める)
      const stage = String(body.stage ?? "") as OnboardingStageId;
      if (!ONBOARDING_STAGES.some((s) => s.id === stage)) {
        return Response.json({ ok: false, error: "stage が不正です" }, { status: 400 });
      }
      const all = await listTasks(placement.id);
      const ids = all.filter((t) => stageOfPhase(t.category) === stage).map((t) => t.id);
      if (ids.length > 0) {
        await prisma.placementTask.updateMany({
          where: { id: { in: ids } },
          data: body.undo ? { doneAt: null } : { doneAt: new Date() },
        });
      }
      return Response.json({ ok: true, tasks: await listTasks(placement.id) });
    }

    if (body.action === "setSupports") {
      // 必要なサポートを選ぶ → サポート工程の未完了タスクを、選んだ分だけに入れ替える
      const supports = readSupports(body.supports);
      await prisma.personPlacement.update({ where: { id: placement.id }, data: { supports } });
      await prisma.placementTask.deleteMany({
        where: { placementId: placement.id, doneAt: null, category: { in: [...SUPPORT_PHASES] } },
      });
      const doneTitles = new Set(
        (await prisma.placementTask.findMany({ where: { placementId: placement.id }, select: { title: true } })).map((t) => t.title),
      );
      const max = await prisma.placementTask.aggregate({ where: { placementId: placement.id }, _max: { sortOrder: true } });
      let order = (max._max.sortOrder ?? 0) + 1;
      const tasks = buildSupportTasks(supports).filter((t) => !doneTitles.has(t.title));
      if (tasks.length > 0) {
        await prisma.placementTask.createMany({
          data: tasks.map((t) => ({ placementId: placement.id, category: t.category, title: t.title, sortOrder: order++ })),
        });
      }
      return Response.json({ ok: true, supports, tasks: await listTasks(placement.id) });
    }

    return Response.json({ ok: false, error: "action が不正です" }, { status: 400 });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 },
    );
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ personId: string }> }) {
  try {
    await requireApiAccount();
    const { personId: raw } = await params;
    // 無いときに作らないよう、ここでは resolvePlacement を使わない
    const where = /^p\d+$/.test(raw) ? { id: Number(raw.slice(1)) } : { personId: Number(raw) };
    const placement = await prisma.personPlacement.findFirst({ where, select: { id: true } });
    if (!placement) return Response.json({ ok: false, error: "カードが見つかりません" }, { status: 404 });
    // チェックリスト・問題記録は連鎖で消える
    await prisma.personPlacement.delete({ where: { id: placement.id } });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 },
    );
  }
}
