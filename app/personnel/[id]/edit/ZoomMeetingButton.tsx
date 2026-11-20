"use client";

import { useEffect, useState } from "react";
import IconAction from "./IconAction";
import CloseButton from "@/app/components/CloseButton";

type Info = {
  titles: { label: string; title: string }[];
  zoomReady: boolean;
  calendarReady: boolean;
};

type Result = {
  joinUrl: string;
  invitation: string;
  calendarLink: string | null;
  calendarError: string | null;
};

/** 候補者詳細の上部アイコン「Zoom」: 面談の Zoom リンクを発行し、人材チームのカレンダーに予定を入れる */
export default function ZoomMeetingButton({ personId }: { personId: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconAction label="Zoom" title="面談の Zoom リンクを発行してカレンダーに入れる" onClick={() => setOpen(true)}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="2" y="6" width="14" height="12" rx="2" />
          <path d="M16 10l6-4v12l-6-4z" />
        </svg>
      </IconAction>
      {open ? <ZoomModal personId={personId} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function ZoomModal({ personId, onClose }: { personId: number; onClose: () => void }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [loadError, setLoadError] = useState("");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState(60);
  const [addToCalendar, setAddToCalendar] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    fetch(`/api/personnel/${personId}/zoom-meeting`)
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) throw new Error(j.error);
        setInfo(j);
        setTitle(j.titles[0]?.title ?? "");
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : "読み込めませんでした"));
  }, [personId]);

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/personnel/${personId}/zoom-meeting`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, start: `${date}T${time}`, durationMin: duration, addToCalendar }),
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error);
      setResult(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : "作成できませんでした");
    } finally {
      setBusy(false);
    }
  };

  const copy = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(""), 1500);
  };

  const input = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-[var(--color-text-dark)]";
  const label = "mb-1 block text-xs font-semibold text-[var(--color-text-dark)]";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-3">
          <p className="text-sm font-bold text-[var(--color-text-dark)]">Zoom 面談</p>
          <CloseButton onClick={onClose} />
        </div>

        <div className="space-y-4 overflow-y-auto px-6 py-5">
          {loadError ? <p className="text-sm font-medium text-red-700">{loadError}</p> : null}
          {!info && !loadError ? <p className="text-sm text-gray-700">読み込み中…</p> : null}

          {info && !result ? (
            <>
              {!info.zoomReady ? (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
                  Zoom の連携がまだ設定されていません。
                </p>
              ) : null}
              {info.titles.length > 1 ? (
                <div>
                  <span className={label}>推薦先</span>
                  <select className={input} onChange={(e) => setTitle(e.target.value)} defaultValue={info.titles[0].title}>
                    {info.titles.map((t) => (
                      <option key={t.title} value={t.title}>{t.label}</option>
                    ))}
                  </select>
                </div>
              ) : null}
              <div>
                <span className={label}>タイトル</span>
                <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <span className={label}>日付</span>
                  <input type="date" className={input} value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
                <div>
                  <span className={label}>開始</span>
                  <input type="time" step={300} className={input} value={time} onChange={(e) => setTime(e.target.value)} />
                </div>
                <div>
                  <span className={label}>時間</span>
                  <select className={input} value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                    {[30, 45, 60, 90, 120].map((m) => (
                      <option key={m} value={m}>{m}分</option>
                    ))}
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-[var(--color-text-dark)]">
                <input type="checkbox" checked={addToCalendar} onChange={(e) => setAddToCalendar(e.target.checked)} />
                人材チームのカレンダーに入れる
              </label>
              {error ? <p className="text-sm font-medium text-red-700">{error}</p> : null}
              <button
                type="button"
                onClick={submit}
                disabled={busy || !info.zoomReady || !title.trim() || !date || !time}
                className="w-full rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40"
              >
                {busy ? "作成中…" : "リンクを発行"}
              </button>
            </>
          ) : null}

          {result ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-[#16A34A]/30 bg-[#F0FDF4] px-4 py-3">
                <p className="text-xs font-semibold text-[#166534]">Zoom リンク</p>
                <a href={result.joinUrl} target="_blank" rel="noopener noreferrer" className="break-all text-sm font-medium text-[var(--color-primary)] underline">
                  {result.joinUrl}
                </a>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => copy(result.joinUrl, "url")} className="flex-1 rounded-lg border border-[var(--color-primary)] px-3 py-2 text-sm font-semibold text-[var(--color-primary)]">
                  {copied === "url" ? "コピーしました" : "リンクをコピー"}
                </button>
                <button type="button" onClick={() => copy(result.invitation, "inv")} className="flex-1 rounded-lg border border-[var(--color-primary)] px-3 py-2 text-sm font-semibold text-[var(--color-primary)]">
                  {copied === "inv" ? "コピーしました" : "招待文をコピー"}
                </button>
              </div>
              {result.calendarLink ? (
                <p className="text-sm text-[var(--color-text-dark)]">
                  カレンダーに入れました。{" "}
                  <a href={result.calendarLink} target="_blank" rel="noopener noreferrer" className="font-semibold text-[var(--color-primary)] underline">開く</a>
                </p>
              ) : null}
              {result.calendarError ? <p className="text-sm font-medium text-amber-800">{result.calendarError}</p> : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
