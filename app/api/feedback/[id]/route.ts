/** 修正依頼の状態 / 返事を更新する (要ログイン)。PATCH { status?, reply? } */
import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = ["未対応", "対応中", "完了", "対応しない"];

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireApiAccount();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const data: Record<string, unknown> = {};
    if (typeof body.status === "string" && STATUSES.includes(body.status)) {
      data.status = body.status;
      data.resolvedAt = body.status === "完了" || body.status === "対応しない" ? new Date() : null;
    }
    if (body.reply !== undefined) data.reply = typeof body.reply === "string" && body.reply.trim() ? body.reply.trim() : null;
    const report = await prisma.feedbackReport.update({ where: { id: Number(id) }, data });
    return Response.json({ ok: true, report });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 },
    );
  }
}
