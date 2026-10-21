/**
 * 内定者を候補者とは別に追加する (要ログイン)。
 *
 * 書類作成だけを請け負った内定者など、候補者一覧に載せない人を内定者管理に出すためのもの。
 * 候補者 (Person) は作らず、PersonPlacement に名前・企業名・在留資格を直接持つ (id も候補者とは別)。
 *
 * POST /api/onboarding  { name, companyName?, residenceStatus?, followUpOwnerId?, applicationType?, applicationMethod? }
 */

import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";
import { buildFlowTasks } from "@/lib/onboarding-flow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const str = (v: unknown, max = 200): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

export async function POST(req: Request) {
  try {
    await requireApiAccount();
    const body = await req.json().catch(() => ({}));
    const name = str(body.name);
    if (!name) return Response.json({ ok: false, error: "名前を入力してください" }, { status: 400 });
    const ownerId = Number(body.followUpOwnerId);
    const applicationType = str(body.applicationType, 20);

    const placement = await prisma.personPlacement.create({
      data: {
        externalName: name,
        externalCompanyName: str(body.companyName),
        externalResidenceStatus: str(body.residenceStatus, 50),
        applicationMethod: str(body.applicationMethod),
        applicationType,
        followUpOwnerId: Number.isFinite(ownerId) && ownerId > 0 ? ownerId : null,
        stage: "offer",
        stageChangedAt: new Date(),
      },
    });
    const tasks = buildFlowTasks(applicationType, null);
    if (tasks.length > 0) {
      await prisma.placementTask.createMany({ data: tasks.map((t) => ({ ...t, placementId: placement.id })) });
    }
    const created = await prisma.placementTask.findMany({ where: { placementId: placement.id }, orderBy: { sortOrder: "asc" } });
    return Response.json({ ok: true, placement, tasks: created });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 },
    );
  }
}
