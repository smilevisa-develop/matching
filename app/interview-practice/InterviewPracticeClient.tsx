"use client";

import { useEffect, useRef, useState } from "react";
import { GENDERS, NATIONALITIES } from "@/lib/candidate-profile";
import {
  ANSWER_MAX_SECONDS,
  PRACTICE_FEEDBACK_LANGUAGES,
  PRACTICE_INDUSTRIES,
  PRACTICE_LEVELS,
  PRACTICE_LEVEL_HINTS,
  SPEECH_RATE,
  nationalityToFeedbackLanguage,
  type PracticeLevel,
} from "@/lib/interview-practice-questions";

/**
 * AI 面接練習の公開ページ。
 *
 * 流れ:
 *   1. 基本情報・レベル・分野を入れて「練習を始める」(ここでマイク許可を取る)
 *   2. 面接官 (AI) の質問を、ブラウザの音声合成で読み上げる
 *   3. 読み上げが終わると録音が始まる。話し終わったら「答え終わりました」
 *   4. 回答を送ると、AI が聞き取って次の質問 (または深掘り) を返す。2 に戻る
 *   5. 最後まで終わると、候補者の言語でフィードバックを表示し、メールでも送る
 *
 * 録音は Android (webm/opus) と iOS Safari (mp4) の両方に対応。
 * マイクは回答のたびに取り直す。開いたままだと、iOS で読み上げの音が小さくなるため。
 */

type Phase = "form" | "interview" | "finishing" | "done";
/** speaking = 読み上げ中 / recording = 録音中 / sending = AI の返事待ち / failed = 送信失敗 / micError = マイクが使えない */
type Step = "speaking" | "recording" | "sending" | "failed" | "micError";

type FormValues = {
  name: string;
  nationality: string;
  gender: string;
  email: string;
  level: PracticeLevel;
  industry: string;
  feedbackLanguage: string;
};

type Feedback = {
  summary: string;
  strengths: string[];
  improvements: { question: string; comment: string; exampleAnswer: string }[];
  advice: string;
  labels: { strengths: string; improvements: string; exampleAnswer: string; advice: string };
};

type Answer = { dataUrl: string; seconds: number };

const FORM_STORAGE_KEY = "interview-practice-form";

const EMPTY_FORM: FormValues = {
  name: "",
  nationality: "",
  gender: "",
  email: "",
  level: "N3",
  industry: "",
  feedbackLanguage: "en",
};

/** この端末で使える録音 MIME を選ぶ (Android=webm, iOS=mp4) */
function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/mp4;codecs=mp4a.40.2", "audio/aac"];
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

/**
 * 日本語で読み上げる。読み上げられたら true、できなかったら false を返す。
 * 端末によっては onend が来ないことがあるので、文の長さから見積もった時間で打ち切る。
 */
function speak(text: string, rate: number): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return resolve(false);
    const synth = window.speechSynthesis;
    let settled = false;
    const finish = (spoken: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(spoken);
    };
    // やさしい日本語の分かち書き (半角スペース) は、読み上げでは不自然な間になるので詰める
    const utterance = new SpeechSynthesisUtterance(text.replace(/ /g, ""));
    utterance.lang = "ja-JP";
    utterance.rate = rate;
    const voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith("ja"));
    if (voice) utterance.voice = voice;
    utterance.onend = () => finish(true);
    utterance.onerror = () => finish(false);
    const timer = setTimeout(() => finish(true), 4000 + (text.length * 400) / rate);
    synth.cancel();
    synth.speak(utterance);
  });
}

function formatSeconds(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

export default function InterviewPracticeClient() {
  const [phase, setPhase] = useState<Phase>("form");
  const [form, setForm] = useState<FormValues>(EMPTY_FORM);
  const [languageTouched, setLanguageTouched] = useState(false);
  const [consent, setConsent] = useState(false);
  const [supported, setSupported] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [step, setStep] = useState<Step>("speaking");
  const [say, setSay] = useState("");
  const [showText, setShowText] = useState(false);
  const [questionNumber, setQuestionNumber] = useState(1);
  const [maxQuestions, setMaxQuestions] = useState(10);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);

  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [transcript, setTranscript] = useState<{ role: string; text: string }[]>([]);
  const [emailed, setEmailed] = useState(false);

  const tokenRef = useRef("");
  const turnCountRef = useRef(0);
  const sayRef = useRef("");
  const practiceLevelRef = useRef<PracticeLevel>("N3");
  /** 進行中の読み上げ・録音の世代。やり直し・終了のたびに増やし、古い処理の続きを止める */
  const runRef = useRef(0);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const answerRef = useRef<Promise<Answer | null> | null>(null);
  const pendingRef = useRef<Answer | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  // 前回の入力を戻す (同じ人が何度も練習するため)
  useEffect(() => {
    setSupported(
      typeof navigator !== "undefined" &&
        !!navigator.mediaDevices?.getUserMedia &&
        typeof MediaRecorder !== "undefined",
    );
    try {
      const saved = JSON.parse(window.localStorage.getItem(FORM_STORAGE_KEY) ?? "null");
      if (saved && typeof saved === "object") {
        setForm((f) => ({ ...f, ...saved }));
        setLanguageTouched(true);
      }
    } catch {
      // 保存が使えない端末では、毎回入力してもらう
    }
    // 音声の一覧は遅れて届く端末があるので、先に読み込みを促しておく
    if ("speechSynthesis" in window) window.speechSynthesis.getVoices();
  }, []);

  // 練習中にページを閉じると最初からになるので警告する
  useEffect(() => {
    if (phase !== "interview" && phase !== "finishing") return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [phase]);

  const releaseMic = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    sourceRef.current?.disconnect();
    sourceRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const stopEverything = () => {
    runRef.current += 1;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    recorderRef.current = null;
    releaseMic();
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  };

  // ページを離れるときに、マイクと読み上げを止める
  useEffect(() => {
    return () => {
      stopEverything();
      void audioCtxRef.current?.close().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // レベルメーター
  useEffect(() => {
    const analyser = analyserRef.current;
    if (step !== "recording" || phase !== "interview" || !analyser) {
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
  }, [step, phase]);

  const update = (patch: Partial<FormValues>) => setForm((f) => ({ ...f, ...patch }));

  const onNationalityChange = (nationality: string) => {
    update(
      languageTouched
        ? { nationality }
        : { nationality, feedbackLanguage: nationalityToFeedbackLanguage(nationality) },
    );
  };

  /** 録音を始める。読み上げが終わった直後に呼ぶ */
  const startRecording = async (run: number) => {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      if (run === runRef.current) setStep("micError");
      return;
    }
    if (run !== runRef.current) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    streamRef.current = stream;
    try {
      if (audioCtxRef.current && analyserRef.current) {
        sourceRef.current = audioCtxRef.current.createMediaStreamSource(stream);
        sourceRef.current.connect(analyserRef.current);
      }
    } catch {
      // メーターは飾りなので失敗しても続行
    }

    try {
      const mimeType = pickMimeType();
      const mr = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      const chunks: Blob[] = [];
      const startedAt = performance.now();
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      answerRef.current = new Promise<Answer | null>((resolve) => {
        mr.onstop = async () => {
          const seconds = Math.min(ANSWER_MAX_SECONDS, (performance.now() - startedAt) / 1000);
          const blob = new Blob(chunks, { type: mr.mimeType || mimeType || "audio/webm" });
          if (blob.size === 0) return resolve(null);
          try {
            resolve({ dataUrl: await blobToDataUrl(blob), seconds: Number(seconds.toFixed(2)) });
          } catch {
            resolve(null);
          }
        };
      });
      mr.start();
      recorderRef.current = mr;
      setElapsed(0);
      setStep("recording");
      timerRef.current = setInterval(() => {
        const s = (performance.now() - startedAt) / 1000;
        setElapsed(s);
        // 上限まで話したら、そこで区切って送る
        if (s >= ANSWER_MAX_SECONDS) void finishAnswer();
      }, 250);
    } catch {
      releaseMic();
      setStep("micError");
    }
  };

  /** 面接官の発言を読み上げ、終わったら録音を始める */
  const askAndListen = async (text: string) => {
    stopEverything();
    const run = runRef.current;
    sayRef.current = text;
    setSay(text);
    setError(null);
    setStep("speaking");
    const spoken = await speak(text, SPEECH_RATE[practiceLevelRef.current]);
    if (run !== runRef.current) return;
    // 読み上げられない端末では、質問を文字で見せる
    if (!spoken) setShowText(true);
    await startRecording(run);
  };

  const finish = async () => {
    stopEverything();
    setError(null);
    setPhase("finishing");
    try {
      const res = await fetch(`/api/interview-practice/${tokenRef.current}/finish`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error ?? "フィードバックを作れませんでした。 / Could not create feedback.");
        return;
      }
      setFeedback(data.feedback);
      setTranscript(Array.isArray(data.turns) ? data.turns : []);
      setEmailed(Boolean(data.emailed));
      setPhase("done");
    } catch {
      setError("通信に失敗しました。もう一度押してください。 / Network error. Please try again.");
    }
  };

  /** 回答を送り、面接官の次の発言を受け取る */
  const send = async (answer: Answer | null) => {
    pendingRef.current = answer;
    setError(null);
    setStep("sending");
    try {
      const res = await fetch(`/api/interview-practice/${tokenRef.current}/turn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataUrl: answer?.dataUrl ?? "",
          seconds: answer?.seconds ?? 0,
          turnCount: turnCountRef.current,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error ?? "送信に失敗しました。 / Failed to send.");
        setStep("failed");
        return;
      }
      pendingRef.current = null;
      turnCountRef.current = data.turnCount;
      setQuestionNumber(data.questionNumber);
      if (data.done) {
        // 終わりのあいさつを聞いてから、フィードバックへ進む
        const run = runRef.current;
        sayRef.current = data.say;
        setSay(data.say);
        setStep("speaking");
        await speak(data.say, SPEECH_RATE[practiceLevelRef.current]);
        if (run === runRef.current) await finish();
      } else {
        await askAndListen(data.say);
      }
    } catch {
      setError("通信に失敗しました。通信環境の良い場所で、もう一度送ってください。 / Network error. Please send it again.");
      setStep("failed");
    }
  };

  /** 「答え終わりました」: 録音を止めて送る */
  const finishAnswer = async () => {
    const mr = recorderRef.current;
    if (!mr || mr.state !== "recording") return;
    recorderRef.current = null;
    mr.stop();
    setStep("sending");
    const answer = answerRef.current ? await answerRef.current : null;
    releaseMic();
    await send(answer);
  };

  const start = async () => {
    if (starting) return;
    if (!form.name.trim() || !form.nationality || !form.gender || !form.industry) {
      setError("すべての項目を入力してください。 / Please fill in all fields.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setError("メールアドレスを確認してください。 / Please check your email address.");
      return;
    }
    if (!consent) {
      setError("同意のチェックを入れてください。 / Please check the consent box.");
      return;
    }
    setStarting(true);
    setError(null);
    try {
      // 1. 先にマイク許可を取る (許可できない端末では、登録もしない)
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
      } catch {
        setError(
          "マイクを使えませんでした。ブラウザのマイク許可を「許可」にしてから、もう一度押してください。 / Please allow microphone access and try again.",
        );
        return;
      }
      // レベルメーター用 (iOS はユーザー操作の中で作らないと動かないので、ここで作る)
      try {
        if (!audioCtxRef.current) {
          const AC: typeof AudioContext =
            window.AudioContext ??
            (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          if (AC) {
            const ctx = new AC();
            void ctx.resume().catch(() => {});
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            audioCtxRef.current = ctx;
            analyserRef.current = analyser;
          }
        }
      } catch {
        // メーターは飾りなので失敗しても続行
      }
      // iOS は最初の読み上げをユーザー操作の中で始めないと、以後も音が出ない
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(""));
      }

      // 2. 登録して 1 問目を受け取る
      const res = await fetch("/api/interview-practice/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, name: form.name.trim(), email: form.email.trim(), consent: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error ?? "練習を始められませんでした。 / Could not start.");
        return;
      }
      try {
        window.localStorage.setItem(FORM_STORAGE_KEY, JSON.stringify(form));
      } catch {
        // 保存できなくても練習はできる
      }
      tokenRef.current = data.token;
      turnCountRef.current = data.turnCount;
      practiceLevelRef.current = form.level;
      setQuestionNumber(data.questionNumber);
      setMaxQuestions(data.maxQuestions);
      // やさしいレベルは、最初から質問を文字でも見せる
      setShowText(form.level === "N4");
      setPhase("interview");
      void askAndListen(data.say);
    } catch {
      setError("通信に失敗しました。もう一度お試しください。 / Network error. Please try again.");
    } finally {
      setStarting(false);
    }
  };

  const endEarly = () => {
    if (!window.confirm("練習を終わりますか？ ここまでの回答でフィードバックを作ります。\nEnd the practice now?")) return;
    void finish();
  };

  const backToForm = () => {
    stopEverything();
    setFeedback(null);
    setTranscript([]);
    setError(null);
    setConsent(false);
    setPhase("form");
  };

  // ── 結果 ──
  if (phase === "done" && feedback) {
    return (
      <Page>
        <Card>
          <Brand />
          <h1 className="mt-1 text-lg font-bold text-[var(--color-text-dark)]">
            お疲れさまでした / Well done!
          </h1>
          <p className="mt-3 whitespace-pre-wrap text-[14px] leading-relaxed text-gray-800">{feedback.summary}</p>
          <p className="mt-3 rounded-xl bg-[var(--color-light)] px-4 py-3 text-[12px] leading-relaxed text-gray-600">
            {emailed ? (
              <>
                同じ内容をメールでも送りました（{form.email}）。
                <br />
                We also sent this feedback to your email.
              </>
            ) : (
              <>
                メールは送れませんでした。この画面を保存してください。
                <br />
                We could not send the email. Please save this screen.
              </>
            )}
          </p>
        </Card>

        {feedback.strengths.length > 0 ? (
          <Card>
            <h2 className="text-sm font-bold text-[var(--color-primary)]">{feedback.labels.strengths}</h2>
            <ul className="mt-2 space-y-2 text-[14px] leading-relaxed text-gray-800">
              {feedback.strengths.map((s, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-[9px] inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-primary)]" />
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {feedback.improvements.length > 0 ? (
          <Card>
            <h2 className="text-sm font-bold text-[var(--color-accent)]">{feedback.labels.improvements}</h2>
            <div className="mt-2 space-y-4">
              {feedback.improvements.map((s, i) => (
                <div key={i} className="space-y-2">
                  <p className="text-[13px] font-semibold text-[var(--color-text-dark)]">
                    {i + 1}. 「{s.question}」
                  </p>
                  <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-gray-800">{s.comment}</p>
                  {s.exampleAnswer ? (
                    <div className="rounded-xl bg-[var(--color-light)] px-4 py-3">
                      <p className="text-[11px] font-semibold text-gray-500">{feedback.labels.exampleAnswer}</p>
                      <p className="mt-1 text-[14px] leading-relaxed text-[var(--color-text-dark)]">
                        {s.exampleAnswer}
                      </p>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </Card>
        ) : null}

        {feedback.advice ? (
          <Card>
            <h2 className="text-sm font-bold text-[var(--color-primary)]">{feedback.labels.advice}</h2>
            <p className="mt-2 whitespace-pre-wrap text-[14px] leading-relaxed text-gray-800">{feedback.advice}</p>
          </Card>
        ) : null}

        <Card>
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-gray-600">
              会話の記録 / Conversation record
            </summary>
            <div className="mt-3 space-y-2 text-[13px] leading-relaxed">
              {transcript.map((t, i) => (
                <p key={i} className={t.role === "interviewer" ? "text-gray-500" : "text-[var(--color-text-dark)]"}>
                  <span className="font-semibold">{t.role === "interviewer" ? "面接官" : "あなた"}: </span>
                  {t.text || "（聞き取れませんでした / not heard）"}
                </p>
              ))}
            </div>
          </details>
          <button
            type="button"
            onClick={backToForm}
            className="mt-4 w-full rounded-xl bg-[var(--color-primary)] px-6 py-3.5 text-base font-semibold text-white shadow-sm hover:bg-[var(--color-primary-hover)]"
          >
            もう一度 練習する / Practice again
          </button>
          <p className="mt-3 text-center text-[11px] text-gray-400">
            これは AI が作った練習用のフィードバックです。選考の結果とは関係ありません。
            <br />
            This feedback is for practice only and is not a selection result.
          </p>
        </Card>
      </Page>
    );
  }

  // ── フィードバック作成中 ──
  if (phase === "finishing") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--color-light)] px-6 text-center">
        {error ? (
          <div className="w-full max-w-sm space-y-4">
            <p className="rounded-xl bg-red-50 px-4 py-3 text-[13px] text-red-700">{error}</p>
            <button
              type="button"
              onClick={() => void finish()}
              className="w-full rounded-xl bg-[var(--color-primary)] px-6 py-3.5 text-base font-semibold text-white"
            >
              もう一度 / Try again
            </button>
            <button type="button" onClick={backToForm} className="text-[13px] text-gray-500 underline">
              最初の画面に戻る / Back to start
            </button>
          </div>
        ) : (
          <>
            <div className="h-16 w-16 animate-spin rounded-full border-4 border-[var(--color-primary)]/20 border-t-[var(--color-primary)]" />
            <p className="mt-6 text-lg font-bold text-[var(--color-text-dark)]">フィードバックを作っています…</p>
            <p className="mt-1 text-sm text-gray-500">Creating your feedback… (about 30 seconds)</p>
            <p className="mt-4 max-w-xs text-xs leading-relaxed text-[var(--color-primary)]">
              この画面を閉じずにお待ちください。 / Please keep this screen open.
            </p>
          </>
        )}
      </div>
    );
  }

  // ── 面接中 ──
  if (phase === "interview") {
    const remaining = Math.max(0, ANSWER_MAX_SECONDS - elapsed);
    return (
      <Page>
        <div className="flex items-center gap-1.5">
          {Array.from({ length: maxQuestions }).map((_, i) => (
            <span
              key={i}
              className={`h-1.5 flex-1 rounded-full ${
                i < questionNumber - 1
                  ? "bg-[var(--color-primary)]"
                  : i === questionNumber - 1
                    ? "bg-[var(--color-primary)]/50"
                    : "bg-gray-200"
              }`}
            />
          ))}
        </div>

        <Card>
          <p className="text-[12px] font-semibold text-gray-400">
            質問 {questionNumber}（最大 {maxQuestions}） / Question {questionNumber}
          </p>

          <div className="mt-3 rounded-xl bg-[var(--color-light)] px-4 py-3">
            <p className="text-[11px] font-semibold text-[var(--color-primary)]">面接官 / Interviewer</p>
            {showText ? (
              <p className="mt-1 text-base font-semibold leading-relaxed text-[var(--color-text-dark)]">{say}</p>
            ) : (
              <button
                type="button"
                onClick={() => setShowText(true)}
                className="mt-1 text-[13px] text-gray-500 underline"
              >
                質問を文字で見る / Show the question as text
              </button>
            )}
          </div>

          <div
            className={`mt-4 rounded-xl px-4 py-3 ${
              step === "recording" ? "border-2 border-[#DC2626] bg-[#FEF2F2]" : "border border-gray-200 bg-gray-50"
            }`}
          >
            {step === "speaking" ? (
              <p className="text-[13px] font-medium text-gray-700">
                面接官が話しています… よく聞いてください。 / The interviewer is speaking. Please listen.
              </p>
            ) : step === "recording" ? (
              <>
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-[#DC2626]" />
                  <span className="text-[13px] font-semibold text-[#DC2626]">
                    録音中… 答えてください / Speak now
                  </span>
                  <span className="ml-auto text-lg font-bold tabular-nums text-[#DC2626]">
                    {formatSeconds(remaining)}
                  </span>
                </div>
                <LevelMeter level={level} />
              </>
            ) : step === "sending" ? (
              <div className="flex items-center gap-3">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--color-primary)]/20 border-t-[var(--color-primary)]" />
                <p className="text-[13px] font-medium text-gray-700">
                  面接官が考えています… / The interviewer is thinking…
                </p>
              </div>
            ) : step === "micError" ? (
              <p className="text-[13px] font-medium text-amber-700">
                マイクを使えませんでした。マイクの許可を確認して、「もう一度聞く」を押してください。 / Could not use the
                microphone. Please allow it and press “Listen again”.
              </p>
            ) : (
              <p className="text-[13px] font-medium text-red-700">{error}</p>
            )}
          </div>

          {step === "failed" ? (
            <button
              type="button"
              onClick={() => void send(pendingRef.current)}
              className="mt-4 w-full rounded-xl bg-[var(--color-primary)] px-6 py-3.5 text-base font-semibold text-white shadow-sm hover:bg-[var(--color-primary-hover)]"
            >
              もう一度送る / Send again
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void finishAnswer()}
              disabled={step !== "recording"}
              className="mt-4 w-full rounded-xl bg-[var(--color-primary)] px-6 py-3.5 text-base font-semibold text-white shadow-sm hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              答え終わりました / I&apos;m done
            </button>
          )}
          <button
            type="button"
            onClick={() => void askAndListen(sayRef.current)}
            disabled={step === "speaking" || step === "sending"}
            className="mt-2 w-full rounded-xl border border-[var(--color-secondary)] bg-white px-6 py-3 text-sm font-semibold text-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            もう一度聞く（答えも録り直す） / Listen again
          </button>
        </Card>

        <button type="button" onClick={endEarly} className="mx-auto block text-[12px] text-gray-400 underline">
          練習を終わる / End practice
        </button>
      </Page>
    );
  }

  // ── 登録 ──
  return (
    <Page>
      <Card>
        <Brand />
        <h1 className="mt-1 text-lg font-bold text-[var(--color-text-dark)]">
          AI面接練習 / AI Interview Practice
        </h1>
        <p className="mt-3 text-[13px] leading-relaxed text-gray-700">
          AI の面接官と、声で面接の練習ができます。何回でも練習できます。終わったら、あなたの言葉でアドバイスが届きます。
          <br />
          <span className="text-xs text-gray-500">
            Practice a job interview by voice with an AI interviewer. You will receive advice in your own language
            (about 10 minutes).
          </span>
        </p>
      </Card>

      <Card>
        <div className="space-y-4">
          <Field label="名前 / Name">
            <input
              type="text"
              value={form.name}
              onChange={(e) => update({ name: e.target.value })}
              autoComplete="name"
              maxLength={80}
              className={INPUT_CLASS}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="国籍 / Nationality">
              <select
                value={form.nationality}
                onChange={(e) => onNationalityChange(e.target.value)}
                className={INPUT_CLASS}
              >
                <option value="">-</option>
                {NATIONALITIES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="性別 / Gender">
              <select value={form.gender} onChange={(e) => update({ gender: e.target.value })} className={INPUT_CLASS}>
                <option value="">-</option>
                {GENDERS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="メールアドレス（Gmail） / Email">
            <input
              type="email"
              value={form.email}
              onChange={(e) => update({ email: e.target.value })}
              autoComplete="email"
              inputMode="email"
              placeholder="example@gmail.com"
              className={INPUT_CLASS}
            />
          </Field>

          {/* ボタンが並ぶので label では包まない (label だと説明文のタップで先頭のボタンが押される) */}
          <div>
            <span className="mb-1.5 block text-[12px] font-semibold text-gray-600">
              日本語のレベル / Japanese level
            </span>
            <div className="grid grid-cols-3 gap-2">
              {PRACTICE_LEVELS.map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => update({ level: l })}
                  aria-pressed={form.level === l}
                  className={`rounded-xl border px-2 py-3 text-base font-bold ${
                    form.level === l
                      ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                      : "border-gray-200 bg-white text-[var(--color-text-dark)]"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[12px] text-gray-500">{PRACTICE_LEVEL_HINTS[form.level]}</p>
          </div>

          <Field label="応募する仕事 / Job field">
            <select value={form.industry} onChange={(e) => update({ industry: e.target.value })} className={INPUT_CLASS}>
              <option value="">-</option>
              {PRACTICE_INDUSTRIES.map((i) => (
                <option key={i.key} value={i.key}>
                  {i.label} / {i.en}
                </option>
              ))}
            </select>
          </Field>

          <Field label="アドバイスの言葉 / Language for advice">
            <select
              value={form.feedbackLanguage}
              onChange={(e) => {
                setLanguageTouched(true);
                update({ feedbackLanguage: e.target.value });
              }}
              className={INPUT_CLASS}
            >
              {PRACTICE_FEEDBACK_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.native}（{l.label}）
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Card>

      <Card>
        {!supported ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            このブラウザは録音に対応していません。LINE 内ブラウザの場合は、右上のメニューから Safari / Chrome
            で開いてからお試しください。
            <br />
            <span className="text-xs">Recording is not supported here. Please open this page in Safari or Chrome.</span>
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
                録音した声は AI（Google Gemini）に送られ、文字にして保存されます。声そのものは保存しません。送った内容は、Google
                がサービスの改善に使うことがあります。練習の結果は選考には使いません。以上に同意します。
                <br />
                <span className="text-xs text-gray-500">
                  I agree that my voice is sent to an AI service (Google Gemini) and saved as text. The audio itself is
                  not stored. Google may use the content to improve its services. The results are for practice only and
                  are not used for screening.
                </span>
              </span>
            </label>

            {error ? <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-[13px] text-red-700">{error}</p> : null}

            <button
              type="button"
              onClick={() => void start()}
              disabled={starting}
              className="mt-3 w-full rounded-xl bg-[var(--color-primary)] px-6 py-3.5 text-base font-semibold text-white shadow-sm hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {starting ? "準備しています..." : "練習を始める / Start"}
            </button>
            <p className="mt-2 text-center text-[11px] text-gray-400">
              静かな場所で、音が出るようにして始めてください。 / Start in a quiet place with the sound on.
            </p>
          </>
        )}
      </Card>
    </Page>
  );
}

const INPUT_CLASS =
  "w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-[15px] text-[var(--color-text-dark)] focus:border-[var(--color-primary)] focus:outline-none";

function Page({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--color-light)] px-4 py-6">
      <div className="mx-auto max-w-2xl space-y-4">{children}</div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl bg-white p-5 shadow-md">{children}</div>;
}

function Brand() {
  return (
    <p className="text-[10px] font-semibold tracking-[0.16em] text-[var(--color-primary)]">SMILE MATCHING</p>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-semibold text-gray-600">{label}</span>
      {children}
    </label>
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
