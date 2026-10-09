/**
 * パートナーのレビュー (評価 + コメント) を投稿 / 削除する (要ログイン)。
 *
 * POST   /api/partners/[id]/reviews              { rating, reason } を 1 件追加
 * DELETE /api/partners/[id]/reviews?reviewId=12  1 件削除
 *
 * 1 件ずつ積み上げる形 (Amazon のレビュー欄と同じ考え方)。
 * 投稿日時は自動、記入者はログイン中のアカウント名が入る。
 *
 * Partner.rating / ratingReason は一覧・絞り込み・配信プレビューが参照しているため、
 * 投稿のたびに rating = 全レビューの平均 (四捨五入)、ratingReason = 最新コメント に更新する。
 */

import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 平均点と最新コメントを Partner 側に反映する */
async function syncPartnerSummary(partnerId: number) {
  const reviews = await prisma.partnerRatingHistory.findMany({
    where: { partnerId },
    orderBy: { createdAt: "desc" },
    select: { rating: true, reason: true },
  });
  const scored = reviews.map((r) => r.rating).filter((r): r is number => typeof r === "number");
  const average =
    scored.length > 0 ? Math.round(scored.reduce((a, b) => a + b, 0) / scored.length) : null;
  const latestReason = reviews.find((r) => r.reason && r.reason.trim())?.reason ?? null;
  await prisma.partner.update({
    where: { id: partnerId },
    data: { rating: average, ratingReason: latestReason },
  });
  return { average, count: reviews.length, scoredCount: scored.length };
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const account = await requireApiAccount();
    const { id } = await params;
    const partnerId = Number(id);
    if (!Number.isFinite(partnerId)) {
      return Response.json({ ok: false, error: "partnerId が不正です" }, { status: 400 });
    }
    const body = await req.json();
    const ratingRaw = Number(body?.rating);
    const rating = Number.isFinite(ratingRaw) && ratingRaw >= 1 && ratingRaw <= 5 ? Math.round(ratingRaw) : null;
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
    if (rating === null && !reason) {
      return Response.json(
        { ok: false, error: "星かコメントのどちらかを入力してください" },
        { status: 400 },
      );
    }

    const review = await prisma.partnerRatingHistory.create({
      data: {
        partnerId,
        rating,
        reason: reason || null,
        recordedBy: account.name ?? account.loginId ?? null,
      },
      select: { id: true, rating: true, reason: true, recordedBy: true, createdAt: true },
    });
    const summary = await syncPartnerSummary(partnerId);
    return Response.json({ ok: true, review, summary });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 },
    );
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireApiAccount();
    const { id } = await params;
    const partnerId = Number(id);
    const reviewId = Number(new URL(req.url).searchParams.get("reviewId"));
    if (!Number.isFinite(partnerId) || !Number.isFinite(reviewId)) {
      return Response.json({ ok: false, error: "ID が不正です" }, { status: 400 });
    }
    // 他パートナーのレビューを消せないよう partnerId も条件に入れる
    const deleted = await prisma.partnerRatingHistory.deleteMany({
      where: { id: reviewId, partnerId },
    });
    if (deleted.count === 0) {
      return Response.json({ ok: false, error: "レビューが見つかりません" }, { status: 404 });
    }
    const summary = await syncPartnerSummary(partnerId);
    return Response.json({ ok: true, summary });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 },
    );
  }
}
