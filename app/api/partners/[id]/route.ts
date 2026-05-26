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

function cleanString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function cleanBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v === "true" || v === "1" || v === "実績有り";
  return Boolean(v);
}

function csvFromAny(v: unknown): string | null {
  if (Array.isArray(v)) {
    const arr = v.map((x) => String(x).trim()).filter(Boolean);
    return arr.length === 0 ? null : [...new Set(arr)].join(",");
  }
  if (typeof v === "string") {
    const arr = v
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return arr.length === 0 ? null : [...new Set(arr)].join(",");
  }
  return null;
}

function buildPartnerData(body: Record<string, unknown>) {
  return {
    name: String(body.name ?? "").trim(),
    country: cleanString(body.country),
    channel: cleanString(body.channel),
    linkStatus: cleanString(body.linkStatus) ?? "未",
    contactName: cleanString(body.contactName),
    notes: cleanString(body.notes),
    rating: clampRating(body.rating),
    ratingReason: cleanString(body.ratingReason),
    role: cleanString(body.role),
    hasPerformance: cleanBool(body.hasPerformance),
    email: cleanString(body.email),
    snsContact: cleanString(body.snsContact),
    features: cleanString(body.features),
    introducibleNationalities: csvFromAny(body.introducibleNationalities),
    introducibleScope: cleanString(body.introducibleScope),
    introducibleFields: csvFromAny(body.introducibleFields),
    introducibleResidenceStatuses: csvFromAny(body.introducibleResidenceStatuses),
    feeAmount: cleanString(body.feeAmount),
    minFeeAmount: cleanString(body.minFeeAmount),
    feeShareRatio: cleanString(body.feeShareRatio),
  };
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
    const account = await requireApiAccount();
    const { id } = await params;
    const partnerId = Number(id);
    const body = await req.json();
    const data = buildPartnerData(body);
    if (!data.name) {
      return Response.json({ ok: false, error: "パートナー名を入力してください" }, { status: 400 });
    }

    const before = await prisma.partner.findUnique({
      where: { id: partnerId },
      select: { rating: true, ratingReason: true },
    });

    const partner = await prisma.partner.update({ where: { id: partnerId }, data });

    const ratingChanged = (before?.rating ?? null) !== data.rating;
    const reasonChanged = (before?.ratingReason ?? null) !== data.ratingReason;
    if (ratingChanged || reasonChanged) {
      await prisma.partnerRatingHistory.create({
        data: {
          partnerId,
          rating: data.rating,
          reason: data.ratingReason,
          recordedBy: account.name ?? account.loginId ?? null,
        },
      });
    }

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
