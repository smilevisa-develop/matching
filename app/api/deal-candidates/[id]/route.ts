import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";
import { onDealCandidateStageChanged } from "@/lib/onboarding-autolink";
import { after } from "next/server";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireApiAccount();
    const { id } = await params;
    const body = await req.json();
    const stage = String(body.stage ?? "").trim();
    const note = body.note === undefined ? undefined : String(body.note ?? "").trim() || null;

    if (!stage) {
      return Response.json({ ok: false, error: "候補者ステップを指定してください" }, { status: 400 });
    }

    const candidate = await prisma.dealCandidate.update({
      where: { id: Number(id) },
      data: {
        stage,
        ...(note !== undefined ? { note } : {}),
      },
    });

    // 内定済みになったら内定者管理ボードにカードを用意する (応答は待たせない)
    after(async () => {
      try {
        await onDealCandidateStageChanged(candidate.personId, stage);
      } catch (e) {
        console.warn("内定者ボードの自動作成に失敗:", e instanceof Error ? e.message : e);
      }
    });

    return Response.json({ ok: true, candidate });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 }
    );
  }
}
