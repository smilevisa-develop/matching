import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";
import { after } from "next/server";
import { requestCompanyDatabaseSync } from "@/lib/company-db-sync";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireApiAccount();
    const { id } = await params;
    const deal = await prisma.deal.findUnique({
      where: { id: Number(id) },
      include: {
        company: true,
        owner: { select: { id: true, name: true } },
        candidates: {
          include: {
            person: {
              select: {
                id: true,
                name: true,
                nationality: true,
                residenceStatus: true,
                channel: true,
                photoUrl: true,
              },
            },
          },
          orderBy: { updatedAt: "desc" },
        },
      },
    });

    if (!deal) {
      return Response.json({ ok: false, error: "案件が見つかりません" }, { status: 404 });
    }

    return Response.json({ ok: true, deal });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 }
    );
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireApiAccount();
    const { id } = await params;
    const body = await req.json();
    const updateData: {
      title?: string;
      field?: string | null;
      status?: string;
      priority?: string;
      ownerId?: number | null;
      unitPrice?: string | null;
      deadline?: Date | null;
      acceptedAt?: Date | null;
      requiredCount?: number;
      recommendedCount?: number;
      interviewCount?: number;
      offerCount?: number;
      contractCount?: number;
      declineCount?: number;
      rejectCount?: number;
      notes?: string | null;
    } = {};

    if (body.title !== undefined) updateData.title = String(body.title).trim();
    if (body.field !== undefined) updateData.field = String(body.field ?? "").trim() || null;
    if (body.status !== undefined) updateData.status = String(body.status);
    if (body.priority !== undefined) updateData.priority = String(body.priority);
    if (body.ownerId !== undefined) updateData.ownerId = body.ownerId ? Number(body.ownerId) : null;
    if (body.unitPrice !== undefined) updateData.unitPrice = String(body.unitPrice ?? "").trim() || null;
    if (body.deadline !== undefined) updateData.deadline = body.deadline ? new Date(String(body.deadline)) : null;
    if (body.acceptedAt !== undefined) updateData.acceptedAt = body.acceptedAt ? new Date(String(body.acceptedAt)) : null;
    if (body.requiredCount !== undefined) updateData.requiredCount = Math.max(0, Number(body.requiredCount));
    if (body.recommendedCount !== undefined) updateData.recommendedCount = Math.max(0, Number(body.recommendedCount));
    if (body.interviewCount !== undefined) updateData.interviewCount = Math.max(0, Number(body.interviewCount));
    if (body.offerCount !== undefined) updateData.offerCount = Math.max(0, Number(body.offerCount));
    if (body.contractCount !== undefined) updateData.contractCount = Math.max(0, Number(body.contractCount));
    if (body.declineCount !== undefined) updateData.declineCount = Math.max(0, Number(body.declineCount));
    if (body.rejectCount !== undefined) updateData.rejectCount = Math.max(0, Number(body.rejectCount));
    if (body.notes !== undefined) updateData.notes = String(body.notes ?? "").trim() || null;

    const deal = await prisma.deal.update({
      where: { id: Number(id) },
      data: updateData,
    });

    // 企業データベース(スプシ)へ保存直後に反映する (応答は待たせない)
    after(() => requestCompanyDatabaseSync());
    return Response.json({ ok: true, deal });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 }
    );
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireApiAccount();
    const { id } = await params;
    // 関連 DealCandidate も cascade で削除 (schema 側で onDelete: Cascade)
    await prisma.deal.delete({ where: { id: Number(id) } });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 }
    );
  }
}
