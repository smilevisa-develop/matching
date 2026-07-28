"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 日本語チェックの録音セクション。intake フォームの最後に置く。
 *
 * 迷わせない設計:
 *   - 1 問ずつ、大きな録音ボタン (押す→録音, もう一度押す→停止)
 *   - 録音後に再生して確認、録り直しOK
 *   - Android (webm/opus) と iOS Safari (mp4) の両方に対応
 */

type Question = {
  key: string;
  prompt: string;
  readAloud: string | null;
  seconds: number;
};

export type Recorded = { key: string; dataUrl: string; mimeType: string };

/** この端末で使える録音 MIME を選ぶ (Android=webm, iOS=mp4) */
function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/mp4;codecs=mp4a.40.2",
    "audio/aac",
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return "";
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export default function JapaneseCheckSection({
  questions,
  onChange,
}: {
  questions: Question[];
  /** 全問の録音状態が変わるたびに親へ通知 */
  onChange: (recorded: Recorded[]) => void;
}) {
  const [supported, setSupported] = useState(true);
  const [recorded, setRecorded] = useState<Record<string, Recorded>>({});

  useEffect(() => {
    const ok =
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia &&
      typeof MediaRecorder !== "undefined";
    setSupported(ok);
  }, []);

  const setForKey = (key: string, rec: Recorded | null) => {
    setRecorded((prev) => {
      const next = { ...prev };
      if (rec) next[key] = rec;
      else delete next[key];
      onChange(Object.values(next));
      return next;
    });
  };

  if (!supported) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        このブラウザは録音に対応していません。LINE 内ブラウザの場合は、右上のメニューから
        Safari / Chrome で開いてからお試しください。
        <br />
        <span className="text-xs">
          Recording is not supported here. Please open this page in Safari or Chrome.
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {questions.map((q, idx) => (
        <RecorderCard
          key={q.key}
          index={idx + 1}
          total={questions.length}
          question={q}
          value={recorded[q.key] ?? null}
          onRecorded={(rec) => setForKey(q.key, rec)}
        />
      ))}
    </div>
  );
}

function RecorderCard({
  index,
  total,
  question,
  value,
  onRecorded,
}: {
  index: number;
  total: number;
  question: Question;
  value: Recorded | null;
  onRecorded: (rec: Recorded | null) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      // アンマウント時にマイクを解放
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const start = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const mr = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        const type = mr.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        try {
          const dataUrl = await blobToDataUrl(blob);
          onRecorded({ key: question.key, dataUrl, mimeType: type });
        } catch {
          setError("録音の保存に失敗しました。もう一度お試しください。");
        }
      };
      mr.start();
      mediaRef.current = mr;
      setRecording(true);
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } catch {
      setError(
        "マイクを使えませんでした。ブラウザのマイク許可を確認してください。 / Please allow microphone access.",
      );
    }
  };

  const stop = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    setRecording(false);
    mediaRef.current?.stop();
  };

  const done = Boolean(value);
  const overTime = elapsed > question.seconds + 15; // 目安を大きく超えたら色で促す

  return (
    <div
      className={`rounded-xl border px-4 py-4 ${
        done ? "border-[#BBF7D0] bg-[#F0FDF4]" : "border-gray-200 bg-white"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-gray-400">
          録音 {index} / {total}
        </span>
        {done ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#15803D]">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="20 6 9 17 4 12" /></svg>
            録音できました
          </span>
        ) : null}
      </div>

      <p className="mt-1.5 text-sm font-medium text-[var(--color-text-dark)]">{question.prompt}</p>

      {question.readAloud ? (
        <p className="mt-2 rounded-lg bg-[var(--color-light)] px-3 py-2 text-base leading-relaxed text-[var(--color-text-dark)]">
          {question.readAloud}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {!recording ? (
          <button
            type="button"
            onClick={() => void start()}
            className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white ${
              done ? "bg-gray-400 hover:bg-gray-500" : "bg-[#DC2626] hover:bg-[#B91C1C]"
            }`}
          >
            <span className="inline-block h-3 w-3 rounded-full bg-white" />
            {done ? "録り直す / Re-record" : "録音する / Record"}
          </button>
        ) : (
          <button
            type="button"
            onClick={stop}
            className="inline-flex items-center gap-2 rounded-full bg-[#DC2626] px-5 py-2.5 text-sm font-semibold text-white"
          >
            <span className="inline-block h-3 w-3 animate-pulse rounded-sm bg-white" />
            停止 / Stop（{elapsed}秒）
          </button>
        )}

        <span className="text-[11px] text-gray-400">目安 {question.seconds} 秒</span>
        {overTime ? (
          <span className="text-[11px] text-amber-600">十分です。停止してください</span>
        ) : null}
      </div>

      {value ? (
        <audio
          controls
          src={value.dataUrl}
          className="mt-3 w-full"
          aria-label={`録音 ${index} の再生`}
        />
      ) : null}

      {error ? <p className="mt-2 text-[11px] text-red-600">{error}</p> : null}
    </div>
  );
}
