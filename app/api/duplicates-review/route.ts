import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";
import { MERGE_RECORDS, REVIEW_STATUSES } from "@/lib/duplicate-merge-records";

/** 重複候補者のまとめを確認した結果を保存する (一時ページ /duplicates)。POST { keptId, status, note } */
export async function POST(req: Request) {
  try {
    const account = await requireApiAccount();
    const body = await req.json();
    const keptId = Number(body.keptId);
    if (!MERGE_RECORDS.some((r) => r.keptId === keptId)) {
      return Response.json({ ok: false, error: "対象の組がありません" }, { status: 400 });
    }
    const status = (REVIEW_STATUSES as readonly string[]).includes(body.status) ? (body.status as string) : "未確認";
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 1000) || null : null;
    const reviewedBy = account.name ?? account.loginId ?? null;
    const review = await prisma.duplicateMergeReview.upsert({
      where: { keptId },
      create: { keptId, status, note, reviewedBy },
      update: { status, note, reviewedBy },
    });
    return Response.json({ ok: true, review: { ...review, updatedAt: review.updatedAt.toISOString() } });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 },
    );
  }
}
