/** 推薦リストに出す進捗を保存する (カンバンの列のチェック)。PUT { stages: string[] } */

import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireApiAccount();
    const id = Number((await params).id);
    const body = (await req.json().catch(() => ({}))) as { stages?: unknown };
    const stages = Array.isArray(body.stages) ? body.stages.filter((s): s is string => typeof s === "string").slice(0, 50) : [];
    await prisma.deal.update({ where: { id }, data: { listStages: stages } });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "error" }, { status: error instanceof AuthError ? error.status : 500 });
  }
}
