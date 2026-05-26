import { prisma } from "@/lib/prisma";
import { requireApiAccount, AuthError } from "@/lib/auth";

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

export async function GET() {
  try {
    await requireApiAccount();
    const partners = await prisma.partner.findMany({
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
    });
    return Response.json({ ok: true, partners });
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
    const name = String(body.name ?? "").trim();
    if (!name) {
      return Response.json({ ok: false, error: "パートナー名を入力してください" }, { status: 400 });
    }

    const partner = await prisma.partner.create({
      data: {
        name,
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
