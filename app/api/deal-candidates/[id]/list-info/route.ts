import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";

/**
 * 企業に見せる推薦リストの「面接可能な時間帯」「備考」を社内で入れる (2026/11 トゥイさんの依頼)。
 * 企業の共有ページは見るだけなので、ここで入れたものが開くたびに出る。
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireApiAccount();
    const { id } = await params;
    const body = await req.json();
    const clean = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 500) || null : null);
    const candidate = await prisma.dealCandidate.update({
      where: { id: Number(id) },
      data: { interviewTime: clean(body.interviewTime), companyNote: clean(body.companyNote) },
      select: { id: true, interviewTime: true, companyNote: true },
    });
    return Response.json({ ok: true, candidate });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 }
    );
  }
}
