"use client";

import { useEffect, useRef, useState } from "react";
import {
  JAPANESE_CHECK_QUESTIONS,
  type JapaneseCheckQuestion,
} from "@/lib/japanese-check-questions";

/**
 * 日本語チェック専用の公開ページ (入力フォームとは別リンク)。
 *
 * 受験の流れ (答えを準備したり調べたりできないようにするため):
 *   1. 説明と同意 →「テスト開始」(ここでマイク許可を取り、サーバーに開始を記録)
 *   2. 質問を 1 問ずつ表示。表示と同時に録音が始まり、制限時間で自動停止する
 *   3.「次へ」で次の質問へ。前の質問には戻れない (録り直しも無し)
 *   4. 最後の質問で「送信する」
 * 受験は 1 回のみ。開始済みのリンクを開き直しても受験画面は出ない (再発行で再受験)。
 *
 * 録音は Android (webm/opus) と iOS Safari (mp4) の両方に対応。
 * 録音の長さ (seconds) も送る。サーバー側で「話す速さ (拍/秒)」の算出に使う。
 */

type Recorded = { key: string; dataUrl: string; seconds: number };
type Attempt = "ready" | "started" | "submitted";
type Phase = "intro" | "test" | "sending" | "done" | "locked";

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

export default function JapaneseCheckClient({
  token,
  personName,
  englishName,
  attempt,
}: {
  token: string;
  personName: string;
  englishName: string | null;
  /** 受験状況 (ready = 未受験 / started = 開始済みで未送信 / submitted = 送信済み) */
  attempt: Attempt;
}) {
  const [phase, setPhase] = useState<Phase>(attempt === "ready" ? "intro" : "locked");
  const [lockedReason, setLockedReason] = useState<Attempt>(attempt);
  const [supported, setSupported] = useState(true);
  const [consent, setConsent] = useState(false);
  const [starting, setStarting] = useState(false);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recordingsRef = useRef<Recorded[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    setSupported(
      typeof navigator !== "undefined" &&
        !!navigator.mediaDevices?.getUserMedia &&
        typeof MediaRecorder !== "undefined",
    );
  }, []);

  // 受験中にページを閉じる / 戻ると受験できなくなるので警告する
  useEffect(() => {
    if (phase !== "test" && phase !== "sending") return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [phase]);

  // 終了時にマイクを解放
  useEffect(() => {
    return () => releaseMic();
  }, []);

  const releaseMic = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
  };

  const start = async () => {
    if (!consent || starting) return;
    setStarting(true);
    setError(null);
    try {
      // 1. 先にマイク許可を取る (許可ダイアログで 1 問目の時間を減らさないため)
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        setError(
          "マイクを使えませんでした。ブラウザのマイク許可を「許可」にしてから、もう一度「テスト開始」を押してください。 / Please allow microphone access and try again.",
        );
        return;
      }
      streamRef.current = stream;
      // レベルメーター (iOS はユーザー操作の中で作らないと動かないので、ここで作る)
      try {
        const AC: typeof AudioContext =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AC) {
          const ctx = new AC();
          void ctx.resume().catch(() => {});
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          ctx.createMediaStreamSource(stream).connect(analyser);
          audioCtxRef.current = ctx;
          analyserRef.current = analyser;
        }
      } catch {
        // メーターは飾りなので失敗しても続行
      }

      // 2. サーバーに開始を記録 (受験は 1 回のみ)
      const res = await fetch(`/api/japanese-check/${token}/start`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        releaseMic();
        if (res.status === 409) {
          setLockedReason(data.status === "submitted" ? "submitted" : "started");
          setPhase("locked");
          return;
        }
        setError(
          `テストを開始できませんでした。通信環境の良い場所で、もう一度お試しください。 / Could not start.${
            data.error ? `（${data.error}）` : ""
          }`,
        );
        return;
      }
      recordingsRef.current = [];
      setIndex(0);
      setPhase("test");
    } finally {
      setStarting(false);
    }
  };

  const submit = async () => {
    setPhase("sending");
    setError(null);
    try {
      const res = await fetch(`/api/japanese-check/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordings: recordingsRef.current }),
      });
      const data = await res.json().catch(() => ({}));
      // 前回の送信が実は届いていた (応答だけ失われた) 場合は 409 が返る → 完了扱い
      if (res.status === 409 && String(data.error ?? "").includes("送信済み")) {
        releaseMic();
        setPhase("done");
        return;
      }
      if (!res.ok || !data.ok) {
        setError(
          `送信に失敗しました。通信環境の良い場所で「もう一度送信する」を押してください。 / Failed to send.${
            data.error ? `（${data.error}）` : ""
          }`,
        );
        return;
      }
      releaseMic();
      setPhase("done");
    } catch (e) {
      setError(
        `送信に失敗しました。「もう一度送信する」を押してください。 / Failed to send.（${
          e instanceof Error ? e.message : "error"
        }）`,
      );
    }
  };

  /** 1 問ぶんの録音が終わった (「次へ」) */
  const onAnswered = (rec: Recorded | null) => {
    if (rec) recordingsRef.current = [...recordingsRef.current, rec];
    if (index + 1 < JAPANESE_CHECK_QUESTIONS.length) {
      setIndex(index + 1);
    } else {
      void submit();
    }
  };

  const displayName = englishName ? `${personName}（${englishName}）` : personName;

  if (phase === "done") {
    return (
      <CenterCard>
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#DCFCE7] text-[#16A34A]">
          <CheckIcon />
        </div>
        <h1 className="text-xl font-bold text-[var(--color-text-dark)]">送信完了 / Thank you!</h1>
        <p className="text-sm text-gray-600">
          録音を受け取りました。お疲れさまでした。
          <br />
          Your recordings have been received.
        </p>
      </CenterCard>
    );
  }

  if (phase === "locked") {
    return (
      <CenterCard>
        <h1 className="text-lg font-bold text-[var(--color-text-dark)]">
          {lockedReason === "submitted" ? "受験済みです / Already completed" : "このテストは開始済みです / Already started"}
        </h1>
        <p className="text-sm leading-relaxed text-gray-600">
          {lockedReason === "submitted" ? (
            <>
              このテストはすでに送信されています。受験は 1 回のみです。
              <br />
              This test has already been submitted. You can take it only once.
            </>
          ) : (
            <>
              このテストは途中で終了しています。受験は 1 回のみのため、もう一度受けることはできません。
              もう一度受ける必要がある場合は、担当者に連絡してください。
              <br />
              This test was started but not finished. Please contact your SMILEVISA staff if you
              need to take it again.
            </>
          )}
        </p>
      </CenterCard>
    );
  }

  if (phase === "test" || phase === "sending") {
    const q = JAPANESE_CHECK_QUESTIONS[index];
    return (
      <div className="min-h-screen bg-[var(--color-light)] px-4 py-6">
        {phase === "sending" ? (
          <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/95 px-6 text-center backdrop-blur-sm">
            {error ? (
              <div className="w-full max-w-sm space-y-4">
                <p className="rounded-xl bg-red-50 px-4 py-3 text-[13px] text-red-700">{error}</p>
                <button
                  type="button"
                  onClick={() => void submit()}
                  className="w-full rounded-xl bg-[var(--color-primary)] px-6 py-3.5 text-base font-semibold text-white"
                >
                  もう一度送信する / Send again
                </button>
              </div>
            ) : (
              <>
                <div className="h-16 w-16 animate-spin rounded-full border-4 border-[var(--color-primary)]/20 border-t-[var(--color-primary)]" />
                <p className="mt-6 text-lg font-bold text-[var(--color-text-dark)]">送信しています…</p>
                <p className="mt-1 text-sm text-gray-500">Sending your recordings…</p>
                <p className="mt-4 max-w-xs text-xs leading-relaxed text-gray-500">
                  <span className="font-medium text-[var(--color-primary)]">
                    この画面を閉じずにお待ちください。
                  </span>
                  <br />
                  Please keep this screen open.
                </p>
              </>
            )}
          </div>
        ) : null}

        <div className="mx-auto max-w-2xl">
          <QuestionStep
            key={q.key}
            question={q}
            number={index + 1}
            total={JAPANESE_CHECK_QUESTIONS.length}
            stream={streamRef.current}
            analyser={analyserRef.current}
            onAnswered={onAnswered}
          />
        </div>
      </div>
    );
  }

  // ── intro ──
  return (
    <div className="min-h-screen bg-[var(--color-light)] px-4 py-6">
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="rounded-2xl bg-white p-5 shadow-md">
          <p className="text-[10px] font-semibold tracking-[0.16em] text-[var(--color-primary)]">
            SMILE MATCHING
          </p>
          <h1 className="mt-1 text-lg font-bold text-[var(--color-text-dark)]">
            日本語チェック / Japanese Check
          </h1>
          <p className="mt-1 text-sm text-gray-500">{displayName} さん</p>

          <p className="mt-3 text-[13px] leading-relaxed text-gray-700">
            {JAPANESE_CHECK_QUESTIONS.length} つの質問に、声で答えてください。うまく話せなくても大丈夫です。今の日本語のままで答えてください。
            <br />
            <span className="text-xs text-gray-500">
              Please answer {JAPANESE_CHECK_QUESTIONS.length} questions by voice.
            </span>
          </p>

          <ul className="mt-3 space-y-2 rounded-xl bg-[var(--color-light)] px-4 py-3 text-[13px] leading-relaxed text-gray-700">
            <Rule>
              質問は 1 問ずつ表示されます。表示されると、すぐに録音が始まります。
              <Sub>Questions appear one at a time. Recording starts as soon as each question appears.</Sub>
            </Rule>
            <Rule>
              質問ごとに制限時間があります。時間になると録音は自動で止まります。
              <Sub>Each question has a time limit. Recording stops automatically when time is up.</Sub>
            </Rule>
            <Rule>
              「次へ」を押すと、前の質問には戻れません。録り直しもできません。
              <Sub>After pressing “Next”, you cannot go back or re-record.</Sub>
            </Rule>
            <Rule>
              <b>受験は 1 回だけです。</b>静かな場所で、時間のあるときに始めてください（約 3 分）。
              <Sub>You can take this test only once. Start in a quiet place (about 3 minutes).</Sub>
            </Rule>
          </ul>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-md">
          {!supported ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              このブラウザは録音に対応していません。LINE 内ブラウザの場合は、右上のメニューから
              Safari / Chrome で開いてからお試しください。
              <br />
              <span className="text-xs">
                Recording is not supported here. Please open this page in Safari or Chrome.
              </span>
            </div>
          ) : (
            <>
              <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-0.5 accent-[var(--color-primary)]"
                />
                <span className="text-[13px] leading-relaxed text-gray-700">
                  録音した音声が、選考のために保存・利用されることに同意します。
                  <br />
                  <span className="text-xs text-gray-500">
                    I agree that my voice recordings may be stored and used for screening.
                  </span>
                </span>
              </label>

              {error ? (
                <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-[13px] text-red-700">{error}</p>
              ) : null}

              {!consent ? (
                <p className="mt-3 text-center text-[12px] text-gray-500">
                  「同意します」にチェックを入れてください / Please check the box above
                </p>
              ) : null}

              <button
                type="button"
                onClick={() => void start()}
                disabled={!consent || starting}
                className="mt-3 w-full rounded-xl bg-[var(--color-primary)] px-6 py-3.5 text-base font-semibold text-white shadow-sm hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {starting ? "準備しています..." : "テスト開始 / Start"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * 1 問ぶんの画面。表示と同時に録音を始め、制限時間で自動停止する。
 * 「次へ」で録音を確定して親へ渡す (戻る・録り直しは無い)。
 */
function QuestionStep({
  question,
  number,
  total,
  stream,
  analyser,
  onAnswered,
}: {
  question: JapaneseCheckQuestion;
  number: number;
  total: number;
  stream: MediaStream | null;
  analyser: AnalyserNode | null;
  onAnswered: (rec: Recorded | null) => void;
}) {
  const [remaining, setRemaining] = useState(question.seconds);
  const [recording, setRecording] = useState(false);
  const [timeUp, setTimeUp] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [level, setLevel] = useState(0);
  const [recError, setRecError] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const durationRef = useRef(0);
  /** 録音停止後に確定した結果 (onstop で入る) */
  const resultRef = useRef<Promise<Recorded | null> | null>(null);
  const answeredRef = useRef(false);

  // 表示と同時に録音開始
  useEffect(() => {
    if (!stream) {
      setRecError(true);
      return;
    }
    let timer: ReturnType<typeof setInterval> | null = null;
    try {
      const mimeType = pickMimeType();
      const mr = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      resultRef.current = new Promise<Recorded | null>((resolve) => {
        mr.onstop = async () => {
          const blob = new Blob(chunksRef.current, { type: mr.mimeType || mimeType || "audio/webm" });
          if (blob.size === 0) return resolve(null);
          try {
            resolve({
              key: question.key,
              dataUrl: await blobToDataUrl(blob),
              seconds: Number(durationRef.current.toFixed(2)),
            });
          } catch {
            resolve(null);
          }
        };
      });
      mr.start();
      recorderRef.current = mr;
      startedAtRef.current = performance.now();
      setRecording(true);

      timer = setInterval(() => {
        const elapsed = (performance.now() - startedAtRef.current) / 1000;
        const left = Math.max(0, Math.ceil(question.seconds - elapsed));
        setRemaining(left);
        if (elapsed >= question.seconds) {
          if (timer) clearInterval(timer);
          timer = null;
          stopRecording();
          setTimeUp(true);
        }
      }, 200);
    } catch {
      setRecError(true);
    }
    return () => {
      if (timer) clearInterval(timer);
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // レベルメーター
  useEffect(() => {
    if (!analyser || !recording) {
      setLevel(0);
      return;
    }
    const buf = new Uint8Array(analyser.frequencyBinCount);
    let raf = 0;
    const tick = () => {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const x = (buf[i] - 128) / 128;
        sum += x * x;
      }
      setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 3.2));
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [analyser, recording]);

  const stopRecording = () => {
    const mr = recorderRef.current;
    if (mr && mr.state === "recording") {
      durationRef.current = Math.min(
        question.seconds,
        (performance.now() - startedAtRef.current) / 1000,
      );
      mr.stop();
    }
    setRecording(false);
  };

  const next = async () => {
    if (answeredRef.current) return;
    answeredRef.current = true;
    setFinishing(true);
    stopRecording();
    const rec = resultRef.current ? await resultRef.current : null;
    onAnswered(rec);
  };

  const isLast = number === total;
  const progress = Math.max(0, Math.min(1, remaining / question.seconds));

  return (
    <div className="space-y-4">
      {/* 進み具合 */}
      <div className="flex items-center gap-1.5">
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            className={`h-1.5 flex-1 rounded-full ${
              i < number - 1 ? "bg-[var(--color-primary)]" : i === number - 1 ? "bg-[var(--color-primary)]/50" : "bg-gray-200"
            }`}
          />
        ))}
      </div>

      <div className="rounded-2xl bg-white p-5 shadow-md">
        <p className="text-[12px] font-semibold text-gray-400">
          質問 {number} / {total}
        </p>
        <p className="mt-2 text-base font-semibold leading-relaxed text-[var(--color-text-dark)]">
          {question.prompt.split(" / ")[0]}
        </p>
        {question.prompt.includes(" / ") ? (
          <p className="mt-1 text-[13px] text-gray-500">{question.prompt.split(" / ").slice(1).join(" / ")}</p>
        ) : null}
        {question.readAloud ? (
          <p className="mt-3 rounded-lg bg-[var(--color-light)] px-3 py-3 text-lg leading-relaxed text-[var(--color-text-dark)]">
            {question.readAloud}
          </p>
        ) : null}

        {/* 録音状態 + 残り時間 */}
        <div
          className={`mt-4 rounded-xl px-4 py-3 ${
            recording ? "border-2 border-[#DC2626] bg-[#FEF2F2]" : "border border-gray-200 bg-gray-50"
          }`}
        >
          {recError ? (
            <p className="text-[13px] font-medium text-amber-700">
              録音を開始できませんでした。「次へ」を押して進んでください。 / Could not record. Please press Next.
            </p>
          ) : recording ? (
            <>
              <div className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-[#DC2626]" />
                <span className="text-[13px] font-semibold text-[#DC2626]">
                  録音中… 話してください / Speak now
                </span>
                <span className="ml-auto text-lg font-bold tabular-nums text-[#DC2626]">
                  残り {remaining} 秒
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white">
                <div
                  className="h-full rounded-full bg-[#DC2626] transition-[width] duration-200"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
              <LevelMeter level={level} />
              <p className="mt-1 text-[11px] text-gray-500">
                話し終わったら「{isLast ? "送信する" : "次へ"}」を押してください。 / Press {isLast ? "Submit" : "Next"} when you finish.
              </p>
            </>
          ) : (
            <p className="text-[13px] font-medium text-gray-700">
              {timeUp ? "時間になりました。録音を止めました。 / Time is up." : "録音を止めました。 / Recording stopped."}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => void next()}
          disabled={finishing}
          className="mt-4 w-full rounded-xl bg-[var(--color-primary)] px-6 py-3.5 text-base font-semibold text-white shadow-sm hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
        >
          {isLast ? "送信する / Submit" : "次へ / Next"}
        </button>
        <p className="mt-2 text-center text-[11px] text-gray-400">
          {isLast
            ? "送信すると、テストは終了です。 / This will finish the test."
            : "次へ進むと、この質問には戻れません。 / You cannot come back to this question."}
        </p>
      </div>
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
        const h = 25 + (i / bars) * 75;
        return (
          <span
            key={i}
            className={`flex-1 rounded-sm transition-all duration-75 ${on ? "bg-[#DC2626]" : "bg-gray-200"}`}
            style={{ height: `${on ? h : 20}%` }}
          />
        );
      })}
    </div>
  );
}

function Rule({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="mt-[7px] inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-primary)]" />
      <span>{children}</span>
    </li>
  );
}

function Sub({ children }: { children: React.ReactNode }) {
  return <span className="block text-xs text-gray-500">{children}</span>;
}

function CenterCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-light)] p-6">
      <div className="w-full max-w-md space-y-4 rounded-2xl bg-white p-8 text-center shadow-md">
        {children}
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
