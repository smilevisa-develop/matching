"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * 修正依頼ボタン (全画面の右下)。
 *
 * 操作担当者が「使いにくい / おかしい / こうしたい」を、その場ですぐ送れるようにする。
 *   - 文章は母国語でもよい (送信後に日本語訳が付く)
 *   - スクショは 3 通り: 画面を撮る / 貼り付け (Ctrl+V・⌘V) / ファイルを選ぶ
 *   - 今いる画面の URL は自動で付く
 *   - 「自分の依頼」で、対応状況と土田からの返事が見られる
 */

type Shot = { file: File; url: string };
type MyReport = { id: number; body: string; status: string; reply: string | null; createdAt: string };

const STATUS_STYLE: Record<string, string> = {
  未対応: "bg-gray-100 text-gray-600",
  対応中: "bg-amber-100 text-amber-800",
  完了: "bg-emerald-100 text-emerald-700",
  対応しない: "bg-gray-100 text-gray-400",
};

export default function FeedbackWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"new" | "mine">("new");
  const [text, setText] = useState("");
  const [shots, setShots] = useState<Shot[]>([]);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [mine, setMine] = useState<MyReport[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const addFiles = (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith("image/"));
    setShots((cur) => [...cur, ...images.map((file) => ({ file, url: URL.createObjectURL(file) }))].slice(0, 5));
  };

  // パネルを開いている間は、どこで貼り付けても画像を受け取る
  useEffect(() => {
    if (!open) return;
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.some((f) => f.type.startsWith("image/"))) {
        e.preventDefault();
        addFiles(files);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [open]);

  useEffect(() => {
    if (!open || tab !== "mine") return;
    void fetch("/api/feedback?mine=1")
      .then((r) => r.json())
      .then((d) => setMine(d.ok ? d.reports : []))
      .catch(() => setMine([]));
  }, [open, tab]);

  /** 今の画面を撮る (ブラウザの画面共有で 1 枚だけ撮る。パネルは一度隠す) */
  const captureScreen = async () => {
    try {
      setOpen(false);
      await new Promise((r) => setTimeout(r, 250));
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false, preferCurrentTab: true } as DisplayMediaStreamOptions);
      const video = document.createElement("video");
      video.srcObject = stream;
      video.muted = true;
      await video.play();
      await new Promise((r) => setTimeout(r, 300));
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d")?.drawImage(video, 0, 0);
      stream.getTracks().forEach((t) => t.stop());
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
      if (blob) addFiles([new File([blob], `screen-${Date.now()}.png`, { type: "image/png" })]);
    } catch {
      // 共有をキャンセルしたときは何もしない
    } finally {
      setOpen(true);
    }
  };

  const submit = async () => {
    if (!text.trim() && shots.length === 0) return;
    setSending(true);
    try {
      const form = new FormData();
      form.append("body", text.trim());
      form.append("pageUrl", window.location.pathname + window.location.search);
      for (const s of shots) form.append("images", s.file);
      const res = await fetch("/api/feedback", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        alert(data.error ?? "送信できませんでした");
        return;
      }
      setText("");
      setShots([]);
      setDone(true);
      setMine(null);
      window.setTimeout(() => setDone(false), 2500);
    } finally {
      setSending(false);
    }
  };

  // 画面側のボタンから開けるようにする (チャット画面は右下に送信ボタンがあるので、ヘッダーのボタンから開く)
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("feedback:open", onOpen);
    return () => window.removeEventListener("feedback:open", onOpen);
  }, []);

  // 一覧画面そのものではボタンを出さない
  if (pathname.startsWith("/feedback")) return null;
  const hideFloatingButton = pathname.startsWith("/chat");

  return (
    <>
      {!open && !hideFloatingButton ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-[var(--color-primary)] px-4 py-3 text-sm font-semibold text-white shadow-lg hover:bg-[var(--color-primary-hover)]"
          title="使いにくいところ・おかしいところ・こうしたいことを送る"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          修正依頼
        </button>
      ) : null}

      {open ? (
        <div className="fixed bottom-5 right-5 z-50 flex max-h-[80vh] w-[380px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <div className="flex gap-1 text-sm">
              {(["new", "mine"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`rounded-lg px-3 py-1 font-medium ${tab === t ? "bg-[var(--color-primary)] text-white" : "text-gray-600 hover:bg-gray-100"}`}
                >
                  {t === "new" ? "修正依頼を送る" : "自分の依頼"}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setOpen(false)} className="px-1 text-xl leading-none text-gray-400 hover:text-gray-600" aria-label="閉じる">
              ×
            </button>
          </div>

          {tab === "new" ? (
            <div className="space-y-3 overflow-y-auto p-4">
              {done ? <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">送りました。ありがとうございます！</p> : null}
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={4}
                autoFocus
                placeholder={"どこが使いにくい？ おかしい？ どうしたい？\n例: 保存ボタンを押しても反映されない\n（英語・母国語でもOK）"}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
              />
              <div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void captureScreen()}
                    className="rounded-lg border border-[var(--color-primary)] px-3 py-1.5 text-xs font-semibold text-[var(--color-primary)] hover:bg-[var(--color-light)]"
                  >
                    📷 この画面を撮る
                  </button>
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                  >
                    画像を選ぶ
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      addFiles(Array.from(e.currentTarget.files ?? []));
                      e.currentTarget.value = "";
                    }}
                  />
                </div>
                <p className="mt-1 text-[11px] text-gray-400">スクショは Ctrl+V（Mac は ⌘V）でも貼り付けられます。最大 5 枚。</p>
                {shots.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {shots.map((s, i) => (
                      <div key={s.url} className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={s.url} alt="" className="h-16 w-24 rounded border border-gray-200 object-cover" />
                        <button
                          type="button"
                          onClick={() => setShots((cur) => cur.filter((_, j) => j !== i))}
                          className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-gray-700 text-[11px] text-white"
                          aria-label="外す"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
              <p className="text-[11px] text-gray-400">今の画面（{pathname}）も一緒に送られます。</p>
              <button
                type="button"
                disabled={sending || (!text.trim() && shots.length === 0)}
                onClick={() => void submit()}
                className="w-full rounded-lg bg-[var(--color-primary)] py-2.5 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-40"
              >
                {sending ? "送信中…" : "送る"}
              </button>
            </div>
          ) : (
            <div className="space-y-2 overflow-y-auto p-4">
              {mine === null ? <p className="text-xs text-gray-400">読み込み中…</p> : null}
              {mine && mine.length === 0 ? <p className="text-xs text-gray-400">まだ送った依頼はありません</p> : null}
              {(mine ?? []).map((r) => (
                <div key={r.id} className="rounded-lg border border-gray-100 p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-gray-400">
                      #{r.id} ・ {new Date(r.createdAt).toLocaleDateString("ja-JP")}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[r.status] ?? STATUS_STYLE.未対応}`}>{r.status}</span>
                  </div>
                  <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-gray-800">{r.body}</p>
                  {r.reply ? <p className="mt-2 rounded bg-[var(--color-light)] px-2 py-1 text-xs text-gray-700">返事: {r.reply}</p> : null}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </>
  );
}
