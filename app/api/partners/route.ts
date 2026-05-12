import { prisma } from "@/lib/prisma";
import { requireApiAccount, AuthError } from "@/lib/auth";

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

    const ratingRaw = body.rating;
    let rating: number | null = null;
    if (ratingRaw !== null && ratingRaw !== "" && ratingRaw !== undefined) {
      const n = Math.round(Number(ratingRaw));
      if (Number.isFinite(n) && n >= 1 && n <= 5) rating = n;
    }
    const partner = await prisma.partner.create({
      data: {
        name,
        country: String(body.country ?? "").trim() || null,
        channel: String(body.channel ?? "").trim() || null,
        linkStatus: String(body.linkStatus ?? "未").trim() || "未",
        contactName: String(body.contactName ?? "").trim() || null,
        notes: String(body.notes ?? "").trim() || null,
        rating,
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
