/**
 * AI 面接練習の、面接官の声を配る (公開・未ログイン可)。
 *
 * GET /api/interview-practice/speech/[key]  → audio/wav
 *
 * key は、練習の開始・会話のたびにサーバーが登録した文にだけ対応する
 * (好きな文を読ませることはできない)。まだ音声が無い文は、ここで作ってから返す。
 * 作れなかったときは 503 を返し、画面側が端末の読み上げに切り替える。
 */

import { loadSpeechAudio } from "@/lib/interview-practice-speech";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(_req: Request, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  try {
    const wav = await loadSpeechAudio(key);
    if (!wav) return new Response("Not Found", { status: 404 });
    return new Response(new Uint8Array(wav), {
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": String(wav.length),
        // 同じ鍵の音声は変わらないので、端末に長く持たせる (聞き直しで再取得しない)
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("[interview-practice] speech failed", key, error);
    return new Response("Speech unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
