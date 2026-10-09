"use client";

import { useMemo, useState } from "react";
import RatingStars from "../RatingStars";

/**
 * パートナーのレビュー欄 (Amazon のレビューと同じ考え方)。
 *
 * - 1 件ずつ投稿して積み上げる (上書きしない)
 * - 各レビューに 投稿日時 と 記入者 (ログイン中のアカウント名) が残る
 * - 上部に 平均点 と 件数、星ごとの内訳を出す
 *
 * 投稿すると Partner.rating が全レビューの平均 (四捨五入) に更新されるため、
 * 一覧や絞り込みの★表示もレビュー全体を反映した値になる。
 */

export type PartnerReview = {
  id: number;
  rating: number | null;
  reason: string | null;
  recordedBy: string | null;
  createdAt: string;
};

export default function PartnerReviews({
  partnerId,
  initialReviews,
}: {
  partnerId: number;
  initialReviews: PartnerReview[];
}) {
  const [reviews, setReviews] = useState<PartnerReview[]>(initialReviews);
  const [rating, setRating] = useState(0);
  const [reason, setReason] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stats = useMemo(() => {
    const scored = reviews
      .map((r) => r.rating)
      .filter((r): r is number => typeof r === "number" && r > 0);
    const average =
      scored.length > 0 ? scored.reduce((a, b) => a + b, 0) / scored.length : null;
    const breakdown = [5, 4, 3, 2, 1].map((star) => ({
      star,
      count: scored.filter((s) => s === star).length,
    }));
    return { average, scoredCount: scored.length, breakdown };
  }, [reviews]);

  const post = async () => {
    if (!rating && !reason.trim()) {
      setError("星かコメントのどちらかを入力してください");
      return;
    }
    setPosting(true);
    setError(null);
    try {
      const res = await fetch(`/api/partners/${partnerId}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: rating || null, reason }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "投稿に失敗しました");
        return;
      }
      setReviews((prev) => [data.review as PartnerReview, ...prev]);
      setRating(0);
      setReason("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "投稿に失敗しました");
    } finally {
      setPosting(false);
    }
  };

  const remove = async (reviewId: number) => {
    if (!confirm("このレビューを削除します。よろしいですか?")) return;
    const res = await fetch(`/api/partners/${partnerId}/reviews?reviewId=${reviewId}`, {
      method: "DELETE",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      alert(`削除失敗: ${data.error ?? res.statusText}`);
      return;
    }
    setReviews((prev) => prev.filter((r) => r.id !== reviewId));
  };

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold text-[var(--color-text-dark)]">評価・レビュー</h2>
        <p className="text-[11px] text-gray-400">{reviews.length} 件</p>
      </div>

      {/* 平均点と内訳 */}
      <div className="mt-3 flex flex-wrap items-center gap-6 rounded-xl bg-[var(--color-light)]/60 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="text-3xl font-bold tabular-nums text-[var(--color-text-dark)]">
            {stats.average !== null ? stats.average.toFixed(1) : "—"}
          </span>
          <div>
            <RatingStars value={stats.average !== null ? Math.round(stats.average) : 0} readOnly size={16} />
            <p className="mt-0.5 text-[11px] text-gray-500">
              {stats.scoredCount > 0 ? `星の評価 ${stats.scoredCount} 件の平均` : "まだ星の評価はありません"}
            </p>
          </div>
        </div>
        {stats.scoredCount > 0 ? (
          <div className="min-w-[180px] flex-1 space-y-0.5">
            {stats.breakdown.map((b) => (
              <div key={b.star} className="flex items-center gap-2">
                <span className="w-7 text-right text-[11px] text-gray-500">星{b.star}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-200">
                  <span
                    className="block h-full rounded-full bg-[#F59E0B]"
                    style={{ width: `${(b.count / stats.scoredCount) * 100}%` }}
                  />
                </span>
                <span className="w-6 text-[11px] tabular-nums text-gray-500">{b.count}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* 投稿フォーム */}
      <div className="mt-4 rounded-xl border border-gray-200 p-4">
        <p className="text-sm font-semibold text-[var(--color-text-dark)]">レビューを書く</p>
        <p className="mt-0.5 text-[11px] text-gray-500">
          投稿すると、日付とあなたの名前が付いて下に積み上がります（前のレビューは消えません）。
        </p>
        <div className="mt-2">
          <RatingStars value={rating} onChange={setRating} />
        </div>
        <textarea
          className="mt-2 min-h-20 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="例: スピード対応 / 候補者の質が高い など"
        />
        {error ? <p className="mt-2 text-[12px] text-red-600">{error}</p> : null}
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={() => void post()}
            disabled={posting}
            className="rounded-lg bg-[var(--color-primary)] px-5 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
          >
            {posting ? "投稿中..." : "レビューを投稿"}
          </button>
        </div>
      </div>

      {/* レビュー一覧 */}
      <ol className="mt-4 space-y-2">
        {reviews.map((r, idx) => (
          <li
            key={r.id}
            className={`rounded-xl border px-4 py-3 ${
              idx === 0 ? "border-[var(--color-primary)]/40 bg-[var(--color-light)]/40" : "border-gray-100"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <RatingStars value={r.rating} readOnly size={14} />
                <span className="text-[11px] text-gray-500">{r.rating ?? "—"} / 5</span>
                {idx === 0 ? (
                  <span className="rounded-full bg-[var(--color-primary)] px-2 py-0.5 text-[10px] font-semibold text-white">
                    最新
                  </span>
                ) : null}
              </div>
              <div className="flex items-center gap-3">
                <p className="text-[11px] text-gray-500">
                  {new Date(r.createdAt).toLocaleString("ja-JP", {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {r.recordedBy ? ` ・ ${r.recordedBy}` : ""}
                </p>
                <button
                  type="button"
                  onClick={() => void remove(r.id)}
                  className="text-[11px] text-gray-400 hover:text-red-500"
                >
                  削除
                </button>
              </div>
            </div>
            {r.reason ? (
              <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{r.reason}</p>
            ) : (
              <p className="mt-2 text-xs text-gray-400">コメントなし</p>
            )}
          </li>
        ))}
        {reviews.length === 0 ? (
          <li className="rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-400">
            まだレビューがありません
          </li>
        ) : null}
      </ol>
    </section>
  );
}
