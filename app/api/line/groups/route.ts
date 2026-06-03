/**
 * Bot が在籍中の LINE グループ一覧を返す。
 * `/partners/link` ページで未紐づけグループの一覧表示に使う。
 */
import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireApiAccount();
    const groups = await prisma.lineGroup.findMany({
      orderBy: { lastSeenAt: "desc" },
      include: { partner: { select: { id: true, name: true } } },
    });
    return Response.json({ ok: true, groups });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 }
    );
  }
}
