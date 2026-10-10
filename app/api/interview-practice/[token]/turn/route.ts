/**
 * AI 面接練習の 1 往復 (公開・練習ごとの token で動く)。
 *
 * POST /api/interview-practice/[token]/turn
 *   body: { dataUrl, seconds, turnCount }   dataUrl は "data:audio/...;base64,..."
 *   → { ok, say, done, questionNumber, turnCount }
 *
 * 候補者の回答 (音声) を AI が聞き、次に面接官が言うことを返す。
 * 音声は AI に渡すだけで保存しない。残すのは文字起こしだけ。
 */

import { prisma } from "@/lib/prisma";
import { parseDataUrl } from "@/lib/japanese-check-submit";
import {
  advancePractice,
  countQuestions,
  lastInterviewerTurn,
  observeAnswer,
  type TurnObservation,
} from "@/lib/interview-practice";
import {
  BUSY_MESSAGE,
  MAX_AUDIO_DATA_URL_LENGTH,
  isBusyError,
  loadPracticeSession,
} from "@/lib/interview-practice-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** これより短い録音は、AI を呼ばずに「聞こえなかった」として扱う */
const MIN_ANSWER_SECONDS = 1;

const SILENT: TurnObservation = {
  transcript: "",
  audioIssue: "silent",
  action: "next",
  followupQuestion: "",
  acknowledgement: "",
};

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await ctx.params;
    const session = await loadPracticeSession(token);
    if (!session) {
      return Response.json({ ok: false, error: "練習が見つかりません。 / Session not found." }, { status: 404 });
    }
    const question = lastInterviewerTurn(session.progress.turns);
    const lastTurn = session.progress.turns[session.progress.turns.length - 1];
    if (
      session.status !== "active" ||
      session.expired ||
      !question ||
      question.kind === "closing" ||
      lastTurn?.role !== "interviewer"
    ) {
      return Response.json(
        { ok: false, error: "この練習は終了しています。 / This practice has ended." },
        { status: 409 },
      );
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    // 同じ回答の二重送信や、古い画面からの送信を弾く
    if (!body || body.turnCount !== session.progress.turns.length) {
      return Response.json(
        { ok: false, error: "画面が古くなっています。ページを開き直してください。 / Please reload the page." },
        { status: 409 },
      );
    }

    const seconds = typeof body.seconds === "number" && Number.isFinite(body.seconds) ? body.seconds : null;
    const dataUrl = typeof body.dataUrl === "string" ? body.dataUrl : "";
    if (dataUrl.length > MAX_AUDIO_DATA_URL_LENGTH) {
      return Response.json(
        { ok: false, error: "録音が長すぎます。もう一度、短く答えてください。 / The recording is too long." },
        { status: 413 },
      );
    }
    const audio = dataUrl ? parseDataUrl(dataUrl) : null;

    let observation = SILENT;
    if (audio && (seconds === null || seconds >= MIN_ANSWER_SECONDS)) {
      try {
        observation = await observeAnswer({
          level: session.level,
          industryKey: session.industry,
          progress: session.progress,
          audio,
        });
      } catch (error) {
        console.error("[interview-practice] observe failed", error);
        return Response.json(
          {
            ok: false,
            error: isBusyError(error)
              ? BUSY_MESSAGE
              : "回答を処理できませんでした。もう一度送ってください。 / Could not process your answer. Please send it again.",
          },
          { status: 503 },
        );
      }
    }

    const next = advancePractice(session.progress, session.level, session.industry, observation, seconds);

    // 読んだ時点から変わっていないときだけ書く (同時に 2 回届いた場合の二重進行を防ぐ)
    const saved = await prisma.interviewPracticeSession.updateMany({
      where: { id: session.id, updatedAt: session.updatedAt },
      data: {
        turns: next.progress.turns,
        mainIndex: next.progress.mainIndex,
        followupsUsed: next.progress.followupsUsed,
      },
    });
    if (saved.count === 0) {
      return Response.json(
        { ok: false, error: "画面が古くなっています。ページを開き直してください。 / Please reload the page." },
        { status: 409 },
      );
    }

    return Response.json({
      ok: true,
      say: next.say.text,
      done: next.done,
      questionNumber: countQuestions(next.progress.turns),
      turnCount: next.progress.turns.length,
    });
  } catch (error) {
    console.error("[interview-practice] turn failed", error);
    return Response.json(
      { ok: false, error: "エラーが起きました。もう一度送ってください。 / Something went wrong. Please send it again." },
      { status: 500 },
    );
  }
}
