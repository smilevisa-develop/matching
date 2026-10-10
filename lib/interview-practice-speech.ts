/**
 * AI 面接練習の、面接官の声 (サーバー専用)。
 *
 * 端末の音声合成 (ブラウザの読み上げ) は機械的に聞こえるので、Gemini の音声合成で作った声を使う。
 * 呼び出しを増やさないための工夫:
 *   ・発言を文ごとに分け、同じ文の音声は 1 度だけ作って DB に置く (InterviewPracticeSpeech)。
 *     質問集の文と相づちは決まっているので、2 回目以降は AI を呼ばずに配れる
 *   ・その場で作るのは、AI が考えた深掘りの質問だけ (1 回の面接で最大 3 文)。これは 1 日で消す
 *   ・作れなかったとき (無料枠の超過など) は、画面側が端末の読み上げに切り替える
 *
 * 環境変数 (任意):
 *   INTERVIEW_PRACTICE_TTS       = off   AI の音声を使わない (端末の読み上げだけにする)
 *   INTERVIEW_PRACTICE_TTS_MODEL = 音声合成のモデル名 (未設定なら TTS_MODELS を順に試す)
 *   INTERVIEW_PRACTICE_VOICE     = 声の名前 (未設定なら DEFAULT_VOICE)
 */

import { createHash } from "node:crypto";
import { GoogleGenAI } from "@google/genai";
import { getGeminiKeys } from "./gemini-keys";
import { practiceKeys } from "./interview-practice";
import { allFixedLines } from "./interview-practice-questions";
import { prisma } from "./prisma";

/** 画面に返す、読み上げの 1 文。url が null なら端末の読み上げを使う */
export type SpeechSegment = { text: string; url: string | null };

/** 無料枠のある音声合成モデル。上から順に試し、最初に使えたものを使い続ける */
const TTS_MODELS = ["gemini-3.8-flash-tts", "gemini-3.1-flash-tts-preview"];
/** 落ち着いた、はっきりした声。Gemini の用意している声の名前から選ぶ */
const DEFAULT_VOICE = "Kore";
/** 音声を作れなかったあと、次に試すまで空ける時間 (無料枠の超過時に呼び続けないため) */
const COOLDOWN_MS = 60 * 1000;
/** その場で作った文 (深掘りの質問) の音声を残す時間 */
const DYNAMIC_SPEECH_LIFETIME_MS = 24 * 60 * 60 * 1000;

function ttsEnabled(): boolean {
  return process.env.INTERVIEW_PRACTICE_TTS?.trim().toLowerCase() !== "off";
}

function voiceName(): string {
  return process.env.INTERVIEW_PRACTICE_VOICE?.trim() || DEFAULT_VOICE;
}

/** やさしい日本語の分かち書き (半角スペース) は、読み上げでは不自然な間になるので詰める */
function spokenText(text: string): string {
  return text.replace(/ /g, "").trim();
}

function speechKey(voice: string, text: string): string {
  return createHash("sha256").update(`${voice}\n${text}`).digest("hex").slice(0, 40);
}

let fixedLines: Set<string> | null = null;
function isFixedLine(spoken: string): boolean {
  fixedLines ??= new Set(allFixedLines().map(spokenText));
  return fixedLines.has(spoken);
}

/**
 * 面接官の発言 (文の並び) を、画面に返す形にする。
 * 音声を配る URL は、ここで DB に登録した文にしか出さない
 * (URL を知っていても、好きな文の音声を作らせることはできない)。
 */
export async function prepareSpeech(segments: string[]): Promise<SpeechSegment[]> {
  if (!ttsEnabled()) return segments.map((text) => ({ text, url: null }));
  try {
    const voice = voiceName();
    const rows = segments.map((text) => {
      const spoken = spokenText(text);
      return { text, spoken, key: speechKey(voice, spoken) };
    });
    await prisma.interviewPracticeSpeech.createMany({
      data: rows.map((r) => ({ key: r.key, text: r.spoken, voice, fixed: isFixedLine(r.spoken) })),
      skipDuplicates: true,
    });
    return rows.map((r) => ({ text: r.text, url: `/api/interview-practice/speech/${r.key}` }));
  } catch (error) {
    // 声が出せなくても練習は続けられるので、端末の読み上げに任せる
    console.error("[interview-practice] speech prepare failed", error);
    return segments.map((text) => ({ text, url: null }));
  }
}

/**
 * これから使う文の音声を、先に作っておく (応答を返したあとに裏で動かす)。
 * 練習を始めた時点で、その回に出る質問・相づち・あいさつは決まっているので、
 * 候補者が 1 問目に答えている間に 2 問目以降の音声を用意できる。
 * 1 つずつ順に作り、失敗したらそこでやめる (無料枠の超過時に呼び続けないため)。
 */
export async function warmSpeech(segments: string[]): Promise<void> {
  const prepared = await prepareSpeech(segments);
  for (const seg of prepared) {
    const key = seg.url?.split("/").pop();
    if (!key) return;
    try {
      await loadSpeechAudio(key);
    } catch {
      return;
    }
  }
}

/** その場で作った文の音声のうち、古いものを消す (DB が増え続けないように) */
export async function purgeOldSpeech(): Promise<void> {
  try {
    await prisma.interviewPracticeSpeech.deleteMany({
      where: { fixed: false, createdAt: { lt: new Date(Date.now() - DYNAMIC_SPEECH_LIFETIME_MS) } },
    });
  } catch (error) {
    console.error("[interview-practice] speech purge failed", error);
  }
}

/** 16bit モノラルの生の音声 (PCM) に WAV のヘッダーを付ける */
function pcmToWav(pcm: Buffer, sampleRate: number): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // モノラル
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function isQuotaError(e: unknown): boolean {
  const status = (e as { status?: number })?.status;
  const msg = String((e as { message?: string })?.message ?? e).toUpperCase();
  return status === 429 || /429|RESOURCE_EXHAUSTED|QUOTA|RATE LIMIT/.test(msg);
}

function isModelNotFoundError(e: unknown): boolean {
  const status = (e as { status?: number })?.status;
  const msg = String((e as { message?: string })?.message ?? e).toUpperCase();
  return status === 404 || msg.includes("NOT_FOUND");
}

let workingModel: string | null = null;
let cooldownUntil = 0;

/** 1 つのモデルで音声を作る。枠超過なら次のキーに切り替える */
async function synthesizeWith(model: string, text: string, voice: string): Promise<Buffer> {
  const keys = practiceKeys() ?? getGeminiKeys();
  if (keys.length === 0) throw new Error("GEMINI_API_KEY(S) が未設定です");
  let lastErr: unknown;
  for (const apiKey of keys) {
    try {
      const response = await new GoogleGenAI({ apiKey }).models.generateContent({
        model,
        // 文をそのまま読ませる。話し方の指示を足すと、それも読み上げてしまうモデルがあるため
        contents: [{ role: "user", parts: [{ text }] }],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
        },
      });
      const part = response.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
      const data = part?.inlineData?.data;
      if (!data) throw new Error("音声が返ってきませんでした");
      const bytes = Buffer.from(data, "base64");
      // すでに WAV ならそのまま。生の PCM (audio/L16;rate=24000 など) ならヘッダーを付ける
      if (bytes.subarray(0, 4).toString("latin1") === "RIFF") return bytes;
      const rate = Number(/rate=(\d+)/.exec(part?.inlineData?.mimeType ?? "")?.[1] ?? 24000);
      return pcmToWav(bytes, rate);
    } catch (e) {
      lastErr = e;
      // 枠超過と「このキーでは使えないモデル」は、別のキーなら通ることがある
      if (!isQuotaError(e) && !isModelNotFoundError(e)) throw e;
    }
  }
  throw lastErr;
}

async function synthesize(text: string, voice: string): Promise<Buffer> {
  if (Date.now() < cooldownUntil) throw new Error("音声合成は休止中です (直前に失敗したため)");
  const configured = process.env.INTERVIEW_PRACTICE_TTS_MODEL?.trim();
  const models = workingModel ? [workingModel] : configured ? [configured] : TTS_MODELS;
  let lastErr: unknown;
  for (const model of models) {
    try {
      const wav = await synthesizeWith(model, text, voice);
      workingModel = model;
      return wav;
    } catch (e) {
      lastErr = e;
      console.error(`[interview-practice] speech model "${model}" failed`, e);
      // 枠超過はモデルを変えても同じなので、しばらく休む
      if (isQuotaError(e)) break;
    }
  }
  workingModel = null;
  cooldownUntil = Date.now() + COOLDOWN_MS;
  throw lastErr;
}

/** 同じ文の音声を同時に 2 回作らないための、作成中の一覧 */
const inFlight = new Map<string, Promise<Buffer>>();

/**
 * 鍵から音声 (WAV) を返す。まだ無ければ作って DB に置く。
 * 鍵が登録されていなければ null (= 404)。作れなければ例外。
 */
export async function loadSpeechAudio(key: string): Promise<Buffer | null> {
  if (!/^[0-9a-f]{40}$/.test(key)) return null;
  const row = await prisma.interviewPracticeSpeech.findUnique({
    where: { key },
    select: { text: true, voice: true, audio: true },
  });
  if (!row) return null;
  if (row.audio) return Buffer.from(row.audio);

  let job = inFlight.get(key);
  if (!job) {
    job = synthesize(row.text, row.voice)
      .then(async (wav) => {
        await prisma.interviewPracticeSpeech.update({ where: { key }, data: { audio: new Uint8Array(wav) } });
        return wav;
      })
      .finally(() => inFlight.delete(key));
    inFlight.set(key, job);
  }
  return job;
}
