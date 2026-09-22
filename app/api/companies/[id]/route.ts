import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";
import { after } from "next/server";
import { requestCompanyDatabaseSync } from "@/lib/company-db-sync";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireApiAccount();
    const { id } = await params;
    const company = await prisma.company.findUnique({
      where: { id: Number(id) },
      include: {
        deals: {
          include: {
            owner: { select: { name: true } },
            candidates: { select: { id: true } },
          },
          orderBy: [{ updatedAt: "desc" }, { title: "asc" }],
        },
      },
    });

    if (!company) {
      return Response.json({ ok: false, error: "企業が見つかりません" }, { status: 404 });
    }

    return Response.json({ ok: true, company });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 }
    );
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireApiAccount();
    const { id } = await params;
    const body = await req.json();
    const name = String(body.name ?? "").trim();
    if (!name) {
      return Response.json({ ok: false, error: "企業名を入力してください" }, { status: 400 });
    }

    const externalId = body.externalId !== undefined
      ? (String(body.externalId ?? "").trim() || null)
      : undefined;
    if (externalId) {
      const dup = await prisma.company.findFirst({
        where: { externalId, NOT: { id: Number(id) } },
      });
      if (dup) {
        return Response.json({ ok: false, error: `企業ID "${externalId}" は既に使われています` }, { status: 409 });
      }
    }
    const company = await prisma.company.update({
      where: { id: Number(id) },
      data: {
        name,
        ...(externalId !== undefined ? { externalId } : {}),
        industry: String(body.industry ?? "").trim() || null,
        location: String(body.location ?? "").trim() || null,
        hiringStatus: String(body.hiringStatus ?? "").trim() || "募集中",
        driveFolderUrl: body.driveFolderUrl !== undefined
          ? (String(body.driveFolderUrl ?? "").trim() || null)
          : undefined,
        notes: String(body.notes ?? "").trim() || null,
      },
    });

    // 企業データベース(スプシ)へ保存直後に反映する (応答は待たせない)
    after(() => requestCompanyDatabaseSync());
    return Response.json({ ok: true, company });
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
    await prisma.company.delete({ where: { id: Number(id) } });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 }
    );
  }
}
