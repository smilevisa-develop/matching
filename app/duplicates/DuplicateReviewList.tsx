"use client";

import Link from "next/link";
import { useState } from "react";
import PersonAvatar from "@/app/components/PersonAvatar";

export type ReviewGroup = {
  name: string;
  keptId: number;
  exists: boolean;
  kana: string;
  englishName: string;
  birthDate: string | null;
  nationality: string;
  photoUrl: string | null;
  driveFolderUrl: string | null;
  partnerName: string | null;
  deals: string[];
  placementStage: string | null;
  removed: { id: number; driveUrl: string; partnerName: string | null }[];
  moved: string[];
  kept: string[];
  review: { status: string; note: string; reviewedBy: string; updatedAt: string } | null;
};

export type OpenPair = { ids: number[]; name: string; birthDates: (string | null)[] };

const pad = (id: number) => String(id).padStart(4, "0");
const STATUS_STYLE: Record<string, string> = {
  未確認: "bg-gray-100 text-gray-600",
  問題なし: "bg-emerald-100 text-emerald-700",
  "別人 (戻してほしい)": "bg-red-100 text-red-700",
};

export default function DuplicateReviewList({ groups, open }: { groups: ReviewGroup[]; open: OpenPair[] }) {
  const [items, setItems] = useState(groups);
  const done = items.filter((g) => g.review && g.review.status !== "未確認").length;

  const save = async (keptId: number, status: string, note: string) => {
    const res = await fetch("/api/duplicates-review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keptId, status, note }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      alert(`保存に失敗しました: ${data.error ?? res.statusText}`);
      return;
    }
    setItems((prev) =>
      prev.map((g) =>
        g.keptId === keptId
          ? { ...g, review: { status: data.review.status, note: data.review.note ?? "", reviewedBy: data.review.reviewedBy ?? "", updatedAt: data.review.updatedAt } }
          : g,
      ),
    );
  };

  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold text-[var(--color-text-dark)]">
        確認済み {done} / {items.length} 組
      </p>
      {items.map((g) => (
        <GroupCard key={g.keptId} group={g} onSave={save} />
      ))}

      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <h2 className="text-base font-semibold text-amber-900">まだ残っている重複の疑い (名前と生年月日が同じ)</h2>
        {open.length === 0 ? (
          <p className="mt-2 text-sm text-amber-800">ありません。</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {open.map((o) => (
              <li key={o.ids.join("-")} className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-[var(--color-text-dark)]">{o.name}</span>
                {o.ids.map((id) => (
                  <Link key={id} href={`/personnel/${id}/edit`} target="_blank" className="text-[var(--color-primary)] underline">
                    ID {pad(id)}
                  </Link>
                ))}
                <span className="text-xs text-gray-500">生年月日 {o.birthDates.map((b) => b ?? "未入力").join(" / ")}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function GroupCard({ group: g, onSave }: { group: ReviewGroup; onSave: (keptId: number, status: string, note: string) => Promise<void> }) {
  const [note, setNote] = useState(g.review?.note ?? "");
  const [busy, setBusy] = useState(false);
  const status = g.review?.status ?? "未確認";
  const click = async (s: string) => {
    if (s === "別人 (戻してほしい)" && !note.trim()) {
      alert("別人の場合は、どこが違うかをメモに書いてください");
      return;
    }
    setBusy(true);
    await onSave(g.keptId, s, note);
    setBusy(false);
  };

  return (
    <div className={`rounded-2xl border bg-white p-5 shadow-sm ${status === "問題なし" ? "border-emerald-200" : status === "未確認" ? "border-gray-200" : "border-red-200"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <PersonAvatar photoUrl={g.photoUrl} name={g.kana} size={52} className="shrink-0 rounded-xl" />
          <div>
            <p className="text-lg font-bold text-[var(--color-text-dark)]">{g.englishName}</p>
            <p className="text-sm text-gray-600">
              {g.kana}
              {g.birthDate ? ` ・ 生年月日 ${g.birthDate}` : ""}
              {g.nationality ? ` ・ ${g.nationality}` : ""}
            </p>
          </div>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLE[status] ?? STATUS_STYLE["未確認"]}`}>
          {status}
          {g.review?.reviewedBy && status !== "未確認" ? ` (${g.review.reviewedBy})` : ""}
        </span>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-xs font-semibold text-emerald-800">残した ID</p>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-sm">
            {g.exists ? (
              <Link href={`/personnel/${g.keptId}/edit`} target="_blank" className="font-bold text-[var(--color-primary)] underline">
                ID {pad(g.keptId)} を開く
              </Link>
            ) : (
              <span className="text-red-600">ID {pad(g.keptId)} が見つかりません</span>
            )}
            {g.driveFolderUrl ? (
              <a href={g.driveFolderUrl} target="_blank" rel="noreferrer" className="text-[var(--color-primary)] underline">
                Drive
              </a>
            ) : null}
          </div>
          <dl className="mt-2 space-y-0.5 text-xs text-gray-700">
            <div>パートナー: {g.partnerName ?? "未設定"}</div>
            <div>カンバン: {g.deals.length > 0 ? g.deals.join(" / ") : "なし"}</div>
            {g.placementStage ? <div>内定者管理: あり</div> : null}
          </dl>
        </div>
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
          <p className="text-xs font-semibold text-gray-600">消した ID (Drive フォルダは残っています)</p>
          <ul className="mt-1 space-y-1 text-sm">
            {g.removed.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-gray-800">ID {pad(r.id)}</span>
                <a href={r.driveUrl} target="_blank" rel="noreferrer" className="text-[var(--color-primary)] underline">
                  Drive フォルダ
                </a>
                {r.partnerName ? <span className="text-xs text-gray-500">パートナー: {r.partnerName}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {g.moved.length > 0 || g.kept.length > 0 ? (
        <div className="mt-3 grid gap-3 text-xs md:grid-cols-2">
          {g.moved.length > 0 ? (
            <div>
              <p className="font-semibold text-gray-600">消した ID から入れたもの</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-gray-700">
                {g.moved.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {g.kept.length > 0 ? (
            <div>
              <p className="font-semibold text-gray-600">気をつけるところ</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-gray-700">
                {g.kept.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <label className="min-w-[240px] flex-1 text-xs text-gray-600">
          メモ (別人のときは必ず)
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="例: 生年月日が違う。別人"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
          />
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => void click("問題なし")}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          問題なし
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void click("別人 (戻してほしい)")}
          className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
        >
          別人 (戻してほしい)
        </button>
      </div>
    </div>
  );
}
