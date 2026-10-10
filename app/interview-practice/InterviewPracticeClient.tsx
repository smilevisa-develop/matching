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
 *   1. 基本情報・レベル・分野を入れて「次へ」
 *   1'. 進め方の説明を読んで「面接を始める」(ここでマイク許可を取る)。以後は質問が続けて出る
 *   2. 面接官 (AI) の質問を、AI の音声で聞かせる (使えないときは端末の読み上げに切り替える)
 *   3. 読み上げが終わると録音が始まる。話し終わったら「答え終わりました」
 *   4. 回答を送ると、AI が聞き取って次の質問 (または深掘り) を返す。2 に戻る
 *   5. 最後まで終わると、候補者の言語でフィードバックを表示し、メールでも送る
 *
 * 録音は Android (webm/opus) と iOS Safari (mp4) の両方に対応。
 * マイクは回答のたびに取り直す。開いたままだと、iOS で読み上げの音が小さくなるため。
 */

type Phase = "form" | "intro" | "interview" | "finishing" | "done";
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

/** 面接官の発言の 1 文。url があれば AI の音声、無ければ端末の読み上げで聞かせる */
type SpeechSegment = { text: string; url: string | null };

/** AI の音声を待つ時間の上限。初めての文はサーバーが音声を作るので数秒かかる */
const CLIP_TIMEOUT_MS = 12000;

const FORM_STORAGE_KEY = "interview-practice-form";

/** 面接中の画面で、いま何をする時間かを大きく見せる言葉 (日本語を主役に、英語は小さく添える) */
const STATUS_TEXT: Record<Step, { ja: string; en: string }> = {
  speaking: { ja: "聞いてください", en: "The interviewer is speaking" },
  recording: { ja: "話してください", en: "Recording — answer in Japanese" },
  sending: { ja: "少し待ってください", en: "The interviewer is thinking…" },
  failed: { ja: "送れませんでした", en: "Your answer could not be sent" },
  micError: { ja: "マイクが使えません", en: "Please allow the microphone and try again" },
};

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

/** 端末の日本語の声のうち、いちばん自然に聞こえそうなものを選ぶ */
function pickJapaneseVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("ja"));
  const score = (v: SpeechSynthesisVoice) =>
    (/natural|online|enhanced|premium|siri/i.test(v.name) ? 4 : 0) +
    (/google/i.test(v.name) ? 2 : 0) +
    (v.localService ? 0 : 1);
  return voices.sort((x, y) => score(y) - score(x))[0] ?? null;
}

/**
 * 端末の音声合成で読み上げる (AI の音声が使えないときの代わり)。
 * 読み上げられたら true、できなかったら false を返す。
 * 端末によっては onend が来ないことがあるので、文の長さから見積もった時間で打ち切る。
 */
function speakWithDevice(text: string, rate: number): Promise<boolean> {
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
    const voice = pickJapaneseVoice();
    if (voice) utterance.voice = voice;
    utterance.onend = () => finish(true);
    utterance.onerror = () => finish(false);
    const timer = setTimeout(() => finish(true), 4000 + (text.length * 400) / rate);
    synth.cancel();
    synth.speak(utterance);
  });
}

/** AI の音声を取りに行き、再生用の URL にする。時間内に取れなければ null */
async function fetchClip(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLIP_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    // いったん手元に全部読み込んでから再生する (iOS Safari は、分割取得に対応しない音声 URL を直接は再生できない)
    return URL.createObjectURL(await res.blob());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** 音を出さない、ごく短い WAV。iOS で音声の再生を「ユーザー操作の中」で始めておくために使う */
function silentClipUrl(): string {
  const samples = 800;
  const view = new DataView(new ArrayBuffer(44 + samples * 2));
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + samples * 2, true);
  ascii(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true);
  view.setUint32(28, 16000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, samples * 2, true);
  return URL.createObjectURL(new Blob([view.buffer], { type: "audio/wav" }));
}

/** サーバーの応答から、読み上げる文の並びを取り出す (speech が無ければ全体を 1 文として扱う) */
function toSegments(data: { say?: unknown; speech?: unknown }): SpeechSegment[] {
  if (Array.isArray(data.speech) && data.speech.length > 0) {
    return data.speech
      .filter((seg): seg is SpeechSegment => !!seg && typeof seg.text === "string")
      .map((seg) => ({ text: seg.text, url: typeof seg.url === "string" ? seg.url : null }));
  }
  return [{ text: typeof data.say === "string" ? data.say : "", url: null }];
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
  const segmentsRef = useRef<SpeechSegment[]>([]);
  /** 面接官の声を鳴らすプレーヤー (iOS は、ユーザー操作の中で 1 度再生したものしか後から鳴らせないので使い回す) */
  const audioRef = useRef<HTMLAudioElement | null>(null);
  /** 取得済みの AI 音声 (音声の URL → 再生用の URL)。聞き直しで取り直さないため */
  const clipsRef = useRef(new Map<string, Promise<string | null>>());
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

  // 画面が切り替わったら、いちばん上から見せる (前の画面でスクロールした位置を引きずらない)
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [phase]);

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
    audioRef.current?.pause();
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  };

  const loadClip = (url: string) => {
    let clip = clipsRef.current.get(url);
    if (!clip) {
      clip = fetchClip(url);
      clipsRef.current.set(url, clip);
      // 取れなかったものは覚えておかない (次の機会に取り直す)
      void clip.then((src) => {
        if (!src) clipsRef.current.delete(url);
      });
    }
    return clip;
  };

  /** AI の音声を 1 つ再生する。最後まで鳴らせたら true */
  const playClip = (src: string, rate: number): Promise<boolean> =>
    new Promise((resolve) => {
      const audio = audioRef.current;
      if (!audio) return resolve(false);
      let settled = false;
      const finish = (played: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        clearTimeout(startTimer);
        audio.onended = null;
        audio.onerror = null;
        audio.onpause = null;
        audio.onplaying = null;
        if (!played) audio.pause();
        resolve(played);
      };
      // 再生が終わらない端末のための保険
      const timer = setTimeout(() => finish(false), 60000);
      // 再生が始まらない端末 (自動再生を黙って止める端末など) では、早めに端末の読み上げへ切り替える
      const startTimer = setTimeout(() => finish(false), 4000);
      audio.onplaying = () => clearTimeout(startTimer);
      audio.onended = () => finish(true);
      audio.onerror = () => finish(false);
      // やり直し・終了で止められたとき (stopEverything)
      audio.onpause = () => {
        if (!audio.ended) finish(true);
      };
      audio.src = src;
      audio.playbackRate = rate;
      audio.play().catch(() => finish(false));
    });

  /**
   * 面接官の発言を、文ごとに順番に聞かせる。
   * AI の音声が取れた文はそれを鳴らし、取れなかった文は端末の読み上げにする。
   * どちらでも聞かせられなかった文があれば false。
   */
  const speakSegments = async (segments: SpeechSegment[], run: number): Promise<boolean> => {
    const rate = SPEECH_RATE[practiceLevelRef.current];
    // 2 文目以降も先に取りに行っておく (文と文の間を空けない)
    const clips = segments.map((seg) => (seg.url ? loadClip(seg.url) : Promise.resolve(null)));
    let allSpoken = true;
    for (let i = 0; i < segments.length; i++) {
      const src = await clips[i];
      if (run !== runRef.current) return allSpoken;
      if (src && (await playClip(src, rate.ai))) continue;
      if (run !== runRef.current) return allSpoken;
      if (!(await speakWithDevice(segments[i].text, rate.device))) allSpoken = false;
    }
    return allSpoken;
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
  const askAndListen = async (segments: SpeechSegment[]) => {
    stopEverything();
    const run = runRef.current;
    segmentsRef.current = segments;
    setSay(segments.map((seg) => seg.text).join(" "));
    setError(null);
    setStep("speaking");
    const spoken = await speakSegments(segments, run);
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
        const segments = toSegments(data);
        segmentsRef.current = segments;
        setSay(data.say);
        setStep("speaking");
        await speakSegments(segments, run);
        if (run === runRef.current) await finish();
      } else {
        await askAndListen(toSegments(data));
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

  /** 入力を確かめて、進め方の説明へ進む (面接はまだ始めない) */
  const goToIntro = () => {
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
    setError(null);
    setPhase("intro");
  };

  /** 「面接を始める」: マイク許可を取り、登録して 1 問目へ */
  const start = async () => {
    if (starting) return;
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
      // AI の音声のプレーヤーも同じ理由で、ここで 1 度 (無音を) 再生しておく
      if (!audioRef.current) audioRef.current = new Audio();
      audioRef.current.src = silentClipUrl();
      void audioRef.current.play().catch(() => {});

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
      void askAndListen(toSegments(data));
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
          <h1 className="mt-1 text-2xl font-bold text-[var(--color-text-dark)]">お疲れさまでした</h1>
          <p className="text-sm text-gray-500">Well done!</p>
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
            <span className="block text-lg font-bold leading-tight">もう一度 練習する</span>
            <span className="block text-[11px] font-normal leading-tight opacity-80">Practice again</span>
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
  // スマホの 1 画面に収め、「いま何をする時間か」だけを大きく見せる。押すものは親指の届く下に置く。
  if (phase === "interview") {
    const remaining = Math.max(0, ANSWER_MAX_SECONDS - elapsed);
    const status = STATUS_TEXT[step];
    return (
      <div className="flex min-h-dvh flex-col bg-[var(--color-light)]">
        <header className="mx-auto w-full max-w-md px-5 pt-5">
          <div className="flex items-end justify-between">
            <p className="text-[var(--color-text-dark)]">
              <span className="text-xs font-semibold text-gray-500">質問 </span>
              <span className="text-3xl font-bold leading-none tabular-nums">{questionNumber}</span>
              <span className="ml-1.5 text-xs text-gray-400">/ 最大 {maxQuestions}</span>
            </p>
            <button type="button" onClick={endEarly} className="py-1 text-xs text-gray-400 underline">
              終わる / End
            </button>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full rounded-full bg-[var(--color-primary)] transition-[width] duration-500"
              style={{ width: `${Math.min(100, (questionNumber / maxQuestions) * 100)}%` }}
            />
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-6 py-4 text-center">
          <StatusOrb step={step} level={level} />
          <p
            className={`mt-5 text-[30px] font-bold leading-tight ${
              step === "recording"
                ? "text-[#DC2626]"
                : step === "failed" || step === "micError"
                  ? "text-amber-700"
                  : "text-[var(--color-text-dark)]"
            }`}
          >
            {status.ja}
          </p>
          <p className="mt-1.5 text-sm text-gray-500">{status.en}</p>
          {step === "recording" ? (
            <p className="mt-3 text-sm font-semibold tabular-nums text-[#DC2626]">
              残り {formatSeconds(remaining)}
            </p>
          ) : null}
          {step === "failed" && error ? (
            <div className="mt-4 w-full">
              <Notice text={error} />
            </div>
          ) : null}

          <div className="mt-6 w-full">
            {showText ? (
              <div className="rounded-2xl bg-white px-5 py-4 text-left shadow-sm">
                <p className="text-[11px] font-semibold tracking-wide text-[var(--color-primary)]">面接官の質問</p>
                <p className="mt-1.5 text-lg font-semibold leading-relaxed text-[var(--color-text-dark)]">{say}</p>
              </div>
            ) : (
              <button type="button" onClick={() => setShowText(true)} className="text-sm text-gray-500 underline">
                質問を文字で見る
                <span className="block text-xs text-gray-400">Show the question as text</span>
              </button>
            )}
          </div>
        </main>

        {/* 押すボタンは、小さい画面や長い質問文でもスクロールせずに押せるよう下に固定する */}
        <footer className="sticky bottom-0 mx-auto w-full max-w-md bg-[var(--color-light)] px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2">
          {step === "recording" ? (
            <BigButton ja="答え終わりました" en="I'm done" onClick={() => void finishAnswer()} />
          ) : step === "failed" ? (
            <BigButton ja="もう一度送る" en="Send again" onClick={() => void send(pendingRef.current)} />
          ) : step === "micError" ? (
            <BigButton ja="もう一度ためす" en="Try again" onClick={() => void askAndListen(segmentsRef.current)} />
          ) : (
            <p className="flex h-16 items-center justify-center text-center text-[13px] leading-snug text-gray-400">
              {step === "speaking" ? (
                <span>
                  質問が終わると、自動で録音が始まります
                  <span className="block text-[11px]">Recording starts automatically after the question</span>
                </span>
              ) : (
                <span>
                  この画面のまま、お待ちください
                  <span className="block text-[11px]">Please keep this screen open</span>
                </span>
              )}
            </p>
          )}
          <button
            type="button"
            onClick={() => void askAndListen(segmentsRef.current)}
            disabled={step !== "recording" && step !== "failed"}
            className="mt-2 h-11 w-full text-sm font-semibold text-[var(--color-primary)] disabled:invisible"
          >
            もう一度 質問を聞く <span className="text-xs font-normal text-gray-400">/ Listen again</span>
          </button>
        </footer>
      </div>
    );
  }

  // ── 進め方の説明 ──
  // 入力のあと、いきなり質問を始めない。何が起きるかを先に伝え、本人がボタンを押してから始める。
  if (phase === "intro") {
    const industry = PRACTICE_INDUSTRIES.find((i) => i.key === form.industry);
    return (
      <div className="flex min-h-dvh flex-col bg-[var(--color-light)]">
        <main className="mx-auto w-full max-w-md flex-1 px-6 pb-4 pt-8">
          <Brand />
          <h1 className="mt-2 text-[30px] font-bold leading-tight text-[var(--color-text-dark)]">
            面接の練習を
            <br />
            始めます
          </h1>
          <p className="mt-2 text-sm text-gray-500">Here is how the practice works.</p>

          <div className="mt-5 flex flex-wrap gap-2">
            {[form.level, industry?.label ?? "", "質問 約10問", "約10分"].map((chip) => (
              <span
                key={chip}
                className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[var(--color-primary)] shadow-sm"
              >
                {chip}
              </span>
            ))}
          </div>

          <ol className="mt-7 space-y-5">
            <IntroStep
              n={1}
              title="聞く"
              ja="AI の面接官が、日本語で質問します。"
              en="The AI interviewer asks you a question in Japanese."
            />
            <IntroStep
              n={2}
              title="話す"
              ja="赤いマイクが出たら、声で答えます。"
              en="When the red microphone appears, answer by voice."
            />
            <IntroStep
              n={3}
              title="押す"
              ja="話し終わったら、下のボタンを押します。すぐに次の質問が始まります。"
              en="Press the button when you finish. The next question starts right away."
            />
          </ol>

          <p className="mt-7 rounded-2xl bg-white px-4 py-3 text-[13px] leading-relaxed text-gray-600 shadow-sm">
            静かな場所で、スマホの音が出るようにしてください。うまく話せなくても大丈夫です。
            <span className="mt-1 block text-xs text-gray-400">
              Find a quiet place and turn the sound on. It is OK to make mistakes.
            </span>
          </p>
        </main>

        {/* 始めるボタンは、小さい画面でもスクロールせずに押せるよう下に固定する */}
        <footer className="sticky bottom-0 mx-auto w-full max-w-md bg-[var(--color-light)] px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
          {error ? (
            <div className="mb-3">
              <Notice text={error} />
            </div>
          ) : null}
          <BigButton
            ja={starting ? "準備しています…" : "面接を始める"}
            en={starting ? "Getting ready…" : "Start the interview"}
            onClick={() => void start()}
            disabled={starting}
          />
          <button
            type="button"
            onClick={() => {
              setError(null);
              setPhase("form");
            }}
            disabled={starting}
            className="mt-2 h-11 w-full text-sm font-semibold text-gray-500 disabled:opacity-40"
          >
            入力にもどる <span className="text-xs font-normal text-gray-400">/ Back</span>
          </button>
        </footer>
      </div>
    );
  }

  // ── 登録 ──
  return (
    <Page>
      <div className="px-1 pt-2">
        <Brand />
        <h1 className="mt-1 text-[28px] font-bold leading-tight text-[var(--color-text-dark)]">AI面接練習</h1>
        <p className="text-sm text-gray-500">AI Interview Practice</p>
        <p className="mt-3 text-[15px] leading-relaxed text-gray-700">
          AI の面接官と、声で面接の練習ができます。何回でも練習できます。終わったら、あなたの言葉でアドバイスが届きます。
        </p>
        <p className="mt-1 text-xs leading-relaxed text-gray-400">
          Practice a job interview by voice with an AI interviewer, as many times as you like. You will receive advice
          in your own language.
        </p>
      </div>

      <Card>
        <div className="space-y-5">
          <Field label="名前" sub="Name">
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
            <Field label="国籍" sub="Nationality">
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
            <Field label="性別" sub="Gender">
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
          <Field label="メールアドレス" sub="Email (Gmail)">
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
        </div>
      </Card>

      <Card>
        <div className="space-y-5">
          {/* ボタンが並ぶので label では包まない (label だと説明文のタップで先頭のボタンが押される) */}
          <div>
            <FieldLabel label="日本語のレベル" sub="Japanese level" />
            <div className="grid grid-cols-3 gap-2">
              {PRACTICE_LEVELS.map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => update({ level: l })}
                  aria-pressed={form.level === l}
                  className={`h-14 rounded-xl border text-xl font-bold ${
                    form.level === l
                      ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                      : "border-gray-200 bg-white text-[var(--color-text-dark)]"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[13px] text-gray-600">
              {PRACTICE_LEVEL_HINTS[form.level].split(" / ")[0]}
              <span className="block text-xs text-gray-400">{PRACTICE_LEVEL_HINTS[form.level].split(" / ")[1]}</span>
            </p>
          </div>

          <Field label="応募する仕事" sub="Job field">
            <select value={form.industry} onChange={(e) => update({ industry: e.target.value })} className={INPUT_CLASS}>
              <option value="">-</option>
              {PRACTICE_INDUSTRIES.map((i) => (
                <option key={i.key} value={i.key}>
                  {i.label} / {i.en}
                </option>
              ))}
            </select>
          </Field>

          <Field label="アドバイスの言葉" sub="Language for advice">
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

      {!supported ? (
        <Card>
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            このブラウザは録音に対応していません。LINE 内ブラウザの場合は、右上のメニューから Safari / Chrome
            で開いてからお試しください。
            <span className="mt-1 block text-xs">
              Recording is not supported here. Please open this page in Safari or Chrome.
            </span>
          </div>
        </Card>
      ) : (
        <div className="space-y-3 pb-2">
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-white px-4 py-4 shadow-md">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-primary)]"
            />
            <span>
              <span className="block text-[15px] font-bold text-[var(--color-text-dark)]">
                下の内容に同意します
                <span className="ml-1.5 text-xs font-normal text-gray-400">I agree</span>
              </span>
              <span className="mt-1.5 block text-[13px] leading-relaxed text-gray-600">
                録音した声は AI（Google Gemini）に送られ、文字にして保存されます。声そのものは保存しません。送った内容は、Google
                がサービスの改善に使うことがあります。練習の結果は選考には使いません。
              </span>
              <span className="mt-1 block text-[11px] leading-relaxed text-gray-400">
                My voice is sent to an AI service (Google Gemini) and saved as text. The audio itself is not stored.
                Google may use the content to improve its services. The results are for practice only and are not used
                for screening.
              </span>
            </span>
          </label>

          {error ? <Notice text={error} /> : null}

          <BigButton ja="次へ" en="Next" onClick={goToIntro} />
        </div>
      )}
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

function FieldLabel({ label, sub }: { label: string; sub: string }) {
  return (
    <span className="mb-1.5 block">
      <span className="text-[15px] font-bold text-[var(--color-text-dark)]">{label}</span>
      <span className="ml-1.5 text-xs text-gray-400">{sub}</span>
    </span>
  );
}

function Field({ label, sub, children }: { label: string; sub: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <FieldLabel label={label} sub={sub} />
      {children}
    </label>
  );
}

/** いちばん大事な操作のボタン。日本語を大きく、英語は小さく添える */
function BigButton({
  ja,
  en,
  onClick,
  disabled,
}: {
  ja: string;
  en: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-16 w-full flex-col items-center justify-center rounded-2xl bg-[var(--color-primary)] text-white shadow-md hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-40"
    >
      <span className="text-lg font-bold leading-tight">{ja}</span>
      <span className="text-[11px] font-normal leading-tight opacity-80">{en}</span>
    </button>
  );
}

/** 「日本語 / English」の形のメッセージを、日本語を主に、英語を小さく分けて見せる */
function Notice({ text }: { text: string }) {
  const [ja, ...rest] = text.split(" / ");
  return (
    <p className="rounded-xl bg-red-50 px-4 py-3 text-left text-sm font-medium leading-relaxed text-red-700">
      {ja}
      {rest.length > 0 ? <span className="mt-0.5 block text-xs font-normal">{rest.join(" / ")}</span> : null}
    </p>
  );
}

function IntroStep({ n, title, ja, en }: { n: number; title: string; ja: string; en: string }) {
  return (
    <li className="flex gap-4">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-lg font-bold text-white">
        {n}
      </span>
      <span>
        <span className="block text-xl font-bold leading-tight text-[var(--color-text-dark)]">{title}</span>
        <span className="mt-1 block text-[15px] leading-relaxed text-gray-700">{ja}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-gray-400">{en}</span>
      </span>
    </li>
  );
}

/** 状態表示の大きさ。縦の短いスマホでは少し小さくして、質問文とボタンを同じ画面に収める */
const ORB_SIZE = "h-36 w-36 [@media(min-height:740px)]:h-44 [@media(min-height:740px)]:w-44";
const ORB_CORE_SIZE = "h-24 w-24 [@media(min-height:740px)]:h-28 [@media(min-height:740px)]:w-28";

/** 面接中の画面の中央に出す、大きな状態表示 (聞く = 緑 / 話す = 赤いマイク / 待つ = くるくる) */
function StatusOrb({ step, level }: { step: Step; level: number }) {
  if (step === "recording") {
    return (
      <div className={`relative flex items-center justify-center ${ORB_SIZE}`} aria-hidden>
        {/* 声の大きさに合わせて外側の輪が広がる (マイクが声を拾えているかの目印) */}
        <span
          className="absolute inset-0 rounded-full bg-[#DC2626]/15 transition-transform duration-100"
          style={{ transform: `scale(${1 + level * 0.2})` }}
        />
        <span className="absolute inset-5 rounded-full bg-[#DC2626]/20" />
        <span className={`relative flex items-center justify-center rounded-full bg-[#DC2626] text-white shadow-lg ${ORB_CORE_SIZE}`}>
          <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="2" width="6" height="12" rx="3" />
            <path d="M5 10v1a7 7 0 0 0 14 0v-1" />
            <line x1="12" y1="18" x2="12" y2="22" />
          </svg>
        </span>
      </div>
    );
  }
  if (step === "speaking") {
    return (
      <div className={`relative flex items-center justify-center ${ORB_SIZE}`} aria-hidden>
        <span className="absolute inset-3 animate-ping rounded-full bg-[var(--color-primary)]/15 [animation-duration:1.8s]" />
        <span className="absolute inset-5 rounded-full bg-[var(--color-primary)]/15" />
        <span className={`relative flex items-center justify-center rounded-full bg-[var(--color-primary)] text-white shadow-lg ${ORB_CORE_SIZE}`}>
          <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" />
            <path d="M15.5 8.5a5 5 0 0 1 0 7" />
            <path d="M18.5 5.5a9 9 0 0 1 0 13" />
          </svg>
        </span>
      </div>
    );
  }
  if (step === "sending") {
    return (
      <div className={`flex items-center justify-center ${ORB_SIZE}`} aria-hidden>
        <span className={`animate-spin rounded-full border-[6px] border-[var(--color-primary)]/15 border-t-[var(--color-primary)] ${ORB_CORE_SIZE}`} />
      </div>
    );
  }
  return (
    <div className={`flex items-center justify-center ${ORB_SIZE}`} aria-hidden>
      <span className={`flex items-center justify-center rounded-full bg-amber-100 text-6xl font-bold text-amber-600 ${ORB_CORE_SIZE}`}>
        !
      </span>
    </div>
  );
}
