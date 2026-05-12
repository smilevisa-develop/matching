import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";

function clampRating(v: unknown): number | null {
  if (v === null || v === "" || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < 1 || rounded > 5) return null;
  return rounded;
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireApiAccount();
    const { id } = await params;
    const partner = await prisma.partner.findUnique({
      where: { id: Number(id) },
      include: {
        deals: {
          select: {
            id: true,
            title: true,
            status: true,
            requiredCount: true,
            offerCount: true,
            contractCount: true,
            createdAt: true,
            company: { select: { id: true, name: true } },
          },
          orderBy: { updatedAt: "desc" },
        },
        invoices: {
          select: {
            id: true,
            invoiceDate: true,
            invoiceAmount: true,
            invoiceStatus: true,
            dealId: true,
          },
          orderBy: { createdAt: "desc" },
        },
        persons: {
          select: { id: true, name: true, nationality: true, residenceStatus: true },
          orderBy: { id: "desc" },
        },
      },
    });
    if (!partner) return Response.json({ ok: false, error: "見つかりません" }, { status: 404 });
    return Response.json({ ok: true, partner });
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
      return Response.json({ ok: false, error: "パートナー名を入力してください" }, { status: 400 });
    }

    const partner = await prisma.partner.update({
      where: { id: Number(id) },
      data: {
        name,
        country: String(body.country ?? "").trim() || null,
        channel: String(body.channel ?? "").trim() || null,
        linkStatus: String(body.linkStatus ?? "未").trim() || "未",
        contactName: String(body.contactName ?? "").trim() || null,
        notes: String(body.notes ?? "").trim() || null,
        rating: clampRating(body.rating),
        ratingReason: String(body.ratingReason ?? "").trim() || null,
      },
    });

    return Response.json({ ok: true, partner });
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
    await prisma.partner.delete({ where: { id: Number(id) } });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 }
    );
  }
}
