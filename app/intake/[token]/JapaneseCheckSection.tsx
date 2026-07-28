"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 日本語チェックの録音セクション。intake フォームの最後に置く。
 *
 * 迷わせない設計:
 *   - 上部に進捗ドット (●●○ 2/3) で今どこか一目で分かる
 *   - 1 問ずつ、大きな録音ボタン (押す→録音, もう一度押す→停止)
 *   - 録音中は声に反応するレベルメーターで「ちゃんと録れている」を可視化
 *   - 空 / 短すぎる録音は自動で弾いて「もう一度」を促す (中身の無い送信を防ぐ)
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

/** これ未満は「録れていない」とみなす (空 blob / 誤タップ対策) */
const MIN_BYTES = 1500;
const MIN_SECONDS = 0.8;

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

  const doneCount = questions.filter((q) => recorded[q.key]).length;
  const allDone = doneCount === questions.length;

  return (
    <div className="space-y-4">
      {/* 進捗ドット */}
      <div
        className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
          allDone ? "border-[#BBF7D0] bg-[#F0FDF4]" : "border-gray-200 bg-gray-50"
        }`}
      >
        <div className="flex items-center gap-2">
          {questions.map((q, i) => (
            <span
              key={q.key}
              className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                recorded[q.key]
                  ? "bg-[#16A34A] text-white"
                  : "border border-gray-300 bg-white text-gray-400"
              }`}
              aria-hidden
            >
              {recorded[q.key] ? "✓" : i + 1}
            </span>
          ))}
        </div>
        <span className={`text-[12px] font-semibold ${allDone ? "text-[#15803D]" : "text-gray-500"}`}>
          {allDone ? "録音そろいました" : `${doneCount} / ${questions.length} 録音ずみ`}
        </span>
      </div>

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
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);

  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number>(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);

  const cleanupMeter = () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    setLevel(0);
  };

  useEffect(() => {
    return () => {
      // アンマウント時に全リソース解放
      if (timerRef.current) clearInterval(timerRef.current);
      cleanupMeter();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startMeter = (stream: MediaStream) => {
    try {
      const AC: typeof AudioContext =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      audioCtxRef.current = ctx;
      void ctx.resume().catch(() => {});
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const x = (buf[i] - 128) / 128;
          sum += x * x;
        }
        const rms = Math.sqrt(sum / buf.length);
        setLevel(Math.min(1, rms * 3.2));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      // レベルメーターは飾りなので失敗しても録音は続行
    }
  };

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
        const durSec = (performance.now() - startedAtRef.current) / 1000;
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        cleanupMeter();

        // 空 / 短すぎる録音は弾く (中身の無い送信を防ぐ)
        if (blob.size < MIN_BYTES || durSec < MIN_SECONDS) {
          onRecorded(null);
          setError("うまく録音できませんでした。もう一度、少し長めに話してください。");
          return;
        }
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
      startedAtRef.current = performance.now();
      startMeter(stream);
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } catch {
      setError(
        "マイクを使えませんでした。ブラウザのマイク許可を「許可」にしてから、もう一度お試しください。 / Please allow microphone access.",
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
  const isError = !done && !recording && error != null;
  const reachedTarget = elapsed >= question.seconds;

  return (
    <div
      className={`rounded-xl border px-4 py-4 ${
        done
          ? "border-[#BBF7D0] bg-[#F0FDF4]"
          : recording
            ? "border-2 border-[#DC2626] bg-[#FEF2F2]"
            : isError
              ? "border-amber-300 bg-amber-50"
              : "border-gray-200 bg-white"
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

      {/* 録音中: レベルメーター + 経過時間 */}
      {recording ? (
        <div className="mt-3 rounded-lg bg-white/70 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-[#DC2626]" />
            <span className="text-[12px] font-semibold text-[#DC2626]">
              録音中… 話してください / Speak now
            </span>
            <span className="ml-auto text-[12px] font-semibold tabular-nums text-gray-600">
              {elapsed}秒 / 目安 {question.seconds}秒
            </span>
          </div>
          <LevelMeter level={level} />
          <p className="mt-1 text-[11px] text-gray-500">
            {reachedTarget ? "十分です。「停止」を押してください。" : "声に反応してバーが動けば録れています。"}
          </p>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {!recording ? (
          <button
            type="button"
            onClick={() => void start()}
            className={`inline-flex items-center gap-2 rounded-full px-6 py-3 text-base font-semibold text-white shadow-sm ${
              done ? "bg-gray-400 hover:bg-gray-500" : "bg-[#DC2626] hover:bg-[#B91C1C]"
            }`}
          >
            <MicIcon />
            {done ? "録り直す / Re-record" : "押して録音 / Record"}
          </button>
        ) : (
          <button
            type="button"
            onClick={stop}
            className="inline-flex items-center gap-2 rounded-full bg-[#DC2626] px-6 py-3 text-base font-semibold text-white shadow-sm"
          >
            <span className="inline-block h-3.5 w-3.5 rounded-sm bg-white" />
            停止する / Stop
          </button>
        )}

        {!recording && !done ? (
          <span className="text-[11px] text-gray-400">ボタンを押すと録音が始まります</span>
        ) : null}
      </div>

      {done && value ? (
        <div className="mt-3">
          <p className="mb-1 text-[11px] text-gray-500">録音を確認できます / Play back</p>
          <audio
            controls
            src={value.dataUrl}
            className="w-full"
            aria-label={`録音 ${index} の再生`}
          />
        </div>
      ) : null}

      {isError ? <p className="mt-2 text-[12px] font-medium text-amber-700">{error}</p> : null}
    </div>
  );
}

function LevelMeter({ level }: { level: number }) {
  const bars = 20;
  const active = Math.round(level * bars);
  return (
    <div className="mt-2 flex h-6 items-end gap-0.5" aria-hidden>
      {Array.from({ length: bars }).map((_, i) => {
        const on = i < active;
        const h = 25 + (i / bars) * 75; // 右にいくほど高い
        return (
          <span
            key={i}
            className={`flex-1 rounded-sm transition-all duration-75 ${
              on ? "bg-[#DC2626]" : "bg-gray-200"
            }`}
            style={{ height: `${on ? h : 20}%` }}
          />
        );
      })}
    </div>
  );
}

function MicIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}
