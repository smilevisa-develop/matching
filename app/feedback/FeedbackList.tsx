"use client";

import Link from "next/link";
import { useState } from "react";

export type FeedbackItem = {
  id: number;
  accountName: string;
  pageUrl: string;
  body: string;
  bodyJa: string | null;
  imageIds: string[];
  status: string;
  reply: string;
  createdAt: string;
};

const STATUSES = ["未対応", "対応中", "完了", "対応しない"] as const;
const STATUS_STYLE: Record<string, string> = {
  未対応: "bg-red-100 text-red-700",
  対応中: "bg-amber-100 text-amber-800",
  完了: "bg-emerald-100 text-emerald-700",
  対応しない: "bg-gray-100 text-gray-500",
};

export default function FeedbackList({ initial }: { initial: FeedbackItem[] }) {
  const [items, setItems] = useState(initial);
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [zoom, setZoom] = useState<string | null>(null);

  const shown = filter === "open" ? items.filter((i) => i.status === "未対応" || i.status === "対応中") : items;

  const patch = async (id: number, data: Partial<Pick<FeedbackItem, "status" | "reply">>) => {
    setItems((cur) => cur.map((i) => (i.id === id ? { ...i, ...data } : i)));
    const res = await fetch(`/api/feedback/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) alert("保存できませんでした");
  };

  return (
    <>
      <div className="flex gap-2 text-sm">
        {(["open", "all"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-lg px-3 py-1.5 ${filter === f ? "bg-[var(--color-primary)] text-white" : "border border-gray-200 bg-white text-gray-600"}`}
          >
            {f === "open"
              ? `未対応・対応中 (${items.filter((i) => i.status === "未対応" || i.status === "対応中").length})`
              : `すべて (${items.length})`}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {shown.length === 0 ? <p className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-400">なし</p> : null}
        {shown.map((i) => (
          <div key={i.id} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
              <span className="font-semibold text-[var(--color-text-dark)]">#{i.id}</span>
              <span>{i.accountName}</span>
              <span>{new Date(i.createdAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}</span>
              <Link href={i.pageUrl} className="text-[var(--color-primary)] hover:underline">
                画面: {i.pageUrl}
              </Link>
              <select
                value={i.status}
                onChange={(e) => void patch(i.id, { status: e.target.value })}
                className={`ml-auto rounded-full border-0 px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[i.status] ?? ""}`}
              >
                {STATUSES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-gray-800">{i.body}</p>
            {i.bodyJa ? <p className="mt-1 whitespace-pre-wrap rounded-lg bg-[var(--color-light)] px-3 py-2 text-sm text-gray-700">訳: {i.bodyJa}</p> : null}
            {i.imageIds.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {i.imageIds.map((id) => (
                  <button key={id} type="button" onClick={() => setZoom(id)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/feedback/image/${id}`} alt="スクリーンショット" className="h-28 rounded-lg border border-gray-200 object-cover hover:opacity-80" />
                  </button>
                ))}
              </div>
            ) : null}
            <ReplyBox initial={i.reply} onSave={(reply) => void patch(i.id, { reply })} />
          </div>
        ))}
      </div>

      {zoom ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6" onClick={() => setZoom(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/feedback/image/${zoom}`} alt="スクリーンショット" className="max-h-full max-w-full rounded-lg" />
        </div>
      ) : null}
    </>
  );
}

function ReplyBox({ initial, onSave }: { initial: string; onSave: (reply: string) => void }) {
  const [reply, setReply] = useState(initial);
  return (
    <input
      value={reply}
      onChange={(e) => setReply(e.target.value)}
      onBlur={() => reply.trim() !== initial && onSave(reply.trim())}
      placeholder="返事（送った人の「自分の依頼」に出ます）例: 直しました！"
      className="mt-3 w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 focus:border-[var(--color-primary)] focus:outline-none"
    />
  );
}
