import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";
import { after } from "next/server";
import { requestCompanyDatabaseSync } from "@/lib/company-db-sync";

export async function GET() {
  try {
    await requireApiAccount();
    const deals = await prisma.deal.findMany({
      include: {
        company: { select: { name: true } },
        owner: { select: { name: true } },
        candidates: {
          include: {
            person: {
              select: { name: true, nationality: true },
            },
          },
        },
      },
      orderBy: [{ updatedAt: "desc" }, { title: "asc" }],
    });
    return Response.json({ ok: true, deals });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    await requireApiAccount();
    const body = await req.json();
    const title = String(body.title ?? "").trim();
    const companyId = Number(body.companyId);
    const ownerId = body.ownerId ? Number(body.ownerId) : null;

    if (!title || !Number.isFinite(companyId)) {
      return Response.json({ ok: false, error: "案件名と企業を入力してください" }, { status: 400 });
    }

    const deal = await prisma.deal.create({
      data: {
        title,
        companyId,
        ownerId: Number.isFinite(ownerId ?? NaN) ? ownerId : null,
        field: String(body.field ?? "").trim() || null,
        priority: String(body.priority ?? "normal"),
        status: String(body.status ?? "募集中"),
        unitPrice: String(body.unitPrice ?? "").trim() || null,
        deadline: body.deadline ? new Date(String(body.deadline)) : null,
        acceptedAt: body.acceptedAt ? new Date(String(body.acceptedAt)) : null,
        notes: String(body.notes ?? "").trim() || null,
      },
      include: {
        company: { select: { name: true } },
        owner: { select: { name: true } },
        candidates: {
          include: {
            person: { select: { name: true, nationality: true } },
          },
        },
      },
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
