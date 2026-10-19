import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";
import { todayJst } from "@/lib/deal-stages";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireApiAccount();
    const { id } = await params;
    const body = await req.json();
    const personId = Number(body.personId);

    if (!Number.isFinite(personId)) {
      return Response.json({ ok: false, error: "候補者を選択してください" }, { status: 400 });
    }

    const candidate = await prisma.dealCandidate.create({
      data: {
        dealId: Number(id),
        personId,
        stage: String(body.stage ?? "接続済み"),
        // 入れた日 = 接続日 (進捗管理の月別集計で使う)
        stageDates: { [String(body.stage ?? "接続済み")]: todayJst() },
        note: String(body.note ?? "").trim() || null,
      },
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
    });

    return Response.json({ ok: true, candidate });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 }
    );
  }
}
