/**
 * 内定後に起きた問題の記録を更新する (要ログイン)。
 * PATCH /api/onboarding/issues/[issueId]   { status: "open" | "closed" }
 */

import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ issueId: string }> }) {
  try {
    await requireApiAccount();
    const { issueId: raw } = await params;
    const issueId = Number(raw);
    if (!Number.isFinite(issueId)) {
      return Response.json({ ok: false, error: "issueId が不正です" }, { status: 400 });
    }
    const body = await req.json();
    const status = body.status === "closed" ? "closed" : "open";
    const issue = await prisma.placementIssue.update({
      where: { id: issueId },
      data: { status, resolvedAt: status === "closed" ? new Date() : null },
    });
    return Response.json({ ok: true, issue });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 },
    );
  }
}
