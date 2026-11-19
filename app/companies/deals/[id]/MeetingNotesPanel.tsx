"use client";

import { useEffect, useState } from "react";

/**
 * 企業の「商談メモ」(Notta の議事録)。企業ワークスペースのタブ。
 *
 * 企業との商談には代表しか出ていないため、人材チームがここで中身を確かめられるようにする。
 * 「この会社の議事録を探す」を押すと、議事録スプシ (Zapier が Notta から書き足す) から
 * タイトルにこの企業名を含む議事録を探して保存する。仕組みは lib/meeting-notes.ts。
 */

type Note = {
  id: number;
  title: string;
  meetingAt: string | null;
  meetingAtText: string | null;
  summary: string | null;
  transcript: string | null;
  url: string | null;
};

type SearchResult = { kind: "ok" | "none" | "error"; text: string };

function formatDate(note: Note) {
  if (!note.meetingAt) return note.meetingAtText ?? "";
  return new Date(note.meetingAt).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MeetingNotesPanel({ companyId, companyName }: { companyId: number; companyName: string }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);

  useEffect(() => {
    fetch(`/api/companies/${companyId}/meeting-notes`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setNotes(d.notes as Note[]);
      })
      .finally(() => setLoading(false));
  }, [companyId]);

  const search = async () => {
    setSearching(true);
    setResult(null);
    try {
      const res = await fetch(`/api/companies/${companyId}/meeting-notes`, { method: "POST" });
      const d = await res.json();
      if (!d.ok) {
        setResult({ kind: "error", text: d.error ?? "議事録を探せませんでした" });
        return;
      }
      setNotes(d.notes as Note[]);
      if (d.found === 0) {
        setResult({
          kind: "none",
          text: `この会社の議事録は見つかりませんでした（タイトルに「${companyName}」を含む議事録がありません）`,
        });
      } else if (d.added === 0) {
        setResult({ kind: "ok", text: `${d.found}件見つかりました。すべて保存済みです` });
      } else {
        setResult({ kind: "ok", text: `${d.found}件見つかり、${d.added}件を新しく保存しました` });
      }
    } catch {
      setResult({ kind: "error", text: "議事録を探せませんでした。時間をおいてもう一度押してください" });
    } finally {
      setSearching(false);
    }
  };

  const dismiss = async (note: Note) => {
    if (!confirm(`「${note.title}」をこの会社の商談メモから外しますか？（もう一度探しても戻りません）`)) return;
    const res = await fetch(`/api/companies/${companyId}/meeting-notes/${note.id}`, { method: "DELETE" });
    const d = await res.json().catch(() => ({ ok: false }));
    if (d.ok) setNotes((prev) => prev.filter((n) => n.id !== note.id));
    else alert(d.error ?? "外せませんでした");
  };

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[var(--color-text-dark)]">商談メモ（Notta）</h2>
          <p className="mt-0.5 text-xs text-gray-500">
            この企業との商談の議事録です。Notta のタイトルに企業名が入っている議事録を探して保存します。
          </p>
        </div>
        <button
          type="button"
          onClick={search}
          disabled={searching}
          className="shrink-0 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-60"
        >
          {searching ? "探しています..." : "この会社の議事録を探す"}
        </button>
      </div>

      {result ? (
        <p
          role="status"
          className={`mt-3 rounded-lg px-3 py-2 text-sm ${
            result.kind === "ok"
              ? "bg-green-50 text-green-800"
              : result.kind === "none"
                ? "bg-gray-50 text-gray-600"
                : "bg-red-50 text-red-700"
          }`}
        >
          {result.text}
        </p>
      ) : null}

      <div className="mt-4 space-y-3">
        {loading ? (
          <p className="py-4 text-center text-sm text-gray-400">読み込み中...</p>
        ) : notes.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-400">
            まだ商談メモがありません。「この会社の議事録を探す」を押してください
          </p>
        ) : (
          notes.map((note) => (
            <article key={note.id} className="rounded-2xl border border-gray-200 px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-[var(--color-text-dark)]">{note.title}</h3>
                  <p className="mt-0.5 text-xs text-gray-500">{formatDate(note)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3 text-xs">
                  {note.url ? (
                    <a
                      href={note.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-[var(--color-primary)] hover:underline"
                    >
                      Notta で開く
                    </a>
                  ) : null}
                  <button type="button" onClick={() => dismiss(note)} className="text-gray-400 hover:text-red-600">
                    この会社のものではない
                  </button>
                </div>
              </div>
              {note.summary ? (
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-gray-700">{note.summary}</p>
              ) : (
                <p className="mt-2 text-sm text-gray-400">要約はありません</p>
              )}
              {note.transcript ? (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs font-medium text-[var(--color-primary)]">
                    文字起こしを見る
                  </summary>
                  <p className="mt-2 max-h-96 overflow-y-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-xs leading-relaxed text-gray-700">
                    {note.transcript}
                  </p>
                </details>
              ) : null}
            </article>
          ))
        )}
      </div>
    </section>
  );
}
