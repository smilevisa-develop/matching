/**
 * AI 面接練習を終えて、フィードバックを作る (公開・練習ごとの token で動く)。
 *
 * POST /api/interview-practice/[token]/finish
 *   → { ok, feedback, turns, emailed }
 *
 * フィードバックは候補者が選んだ言語で作り、画面に出すのと同時に、登録したメールアドレスへ送る。
 * 途中でやめた場合も、1 問でも答えていればそこまでの内容で作る。
 * 作成済みの練習にもう一度呼ばれたら、保存してあるものを返す (メールは送り直さない)。
 */

import { prisma } from "@/lib/prisma";
import { sendEmail, textToBasicHtml } from "@/lib/email";
import { publicUrl } from "@/lib/public-url";
import {
  buildFeedbackEmail,
  buildPracticeFeedback,
  countAnswers,
  parseFeedback,
  type PracticeFeedback,
  type PracticeTurn,
} from "@/lib/interview-practice";
import { BUSY_MESSAGE, isBusyError, loadPracticeSession } from "@/lib/interview-practice-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

/** 候補者の画面に返す内容 (日本語の控えは担当者確認用なので返さない) */
function forCandidate(feedback: PracticeFeedback, turns: PracticeTurn[], emailed: boolean) {
  return {
    ok: true,
    emailed,
    feedback: {
      summary: feedback.summaryNative,
      strengths: feedback.strengths.map((s) => s.native),
      improvements: feedback.improvements.map((s) => ({
        question: s.question,
        comment: s.native,
        exampleAnswer: s.exampleAnswerJa,
      })),
      advice: feedback.adviceNative,
      labels: feedback.labels,
    },
    turns: turns.map((t) => ({ role: t.role, text: t.text })),
  };
}

export async function POST(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await ctx.params;
    const session = await loadPracticeSession(token);
    if (!session) {
      return Response.json({ ok: false, error: "練習が見つかりません。 / Session not found." }, { status: 404 });
    }
    const { turns } = session.progress;

    const stored = parseFeedback(session.feedback);
    if (session.status === "finished" && stored) {
      return Response.json(forCandidate(stored, turns, session.feedbackEmailedAt !== null));
    }

    if (countAnswers(turns) === 0) {
      return Response.json(
        {
          ok: false,
          error: "回答がまだ 1 つもないため、フィードバックを作れません。 / No answers yet, so feedback cannot be made.",
        },
        { status: 400 },
      );
    }

    let feedback: PracticeFeedback;
    try {
      feedback = await buildPracticeFeedback({
        level: session.level,
        industryKey: session.industry,
        languageCode: session.feedbackLanguage,
        turns,
      });
    } catch (error) {
      console.error("[interview-practice] feedback failed", error);
      return Response.json(
        {
          ok: false,
          error: isBusyError(error)
            ? BUSY_MESSAGE
            : "フィードバックを作れませんでした。もう一度押してください。 / Could not create feedback. Please try again.",
        },
        { status: 503 },
      );
    }

    // 同時に 2 回呼ばれても、メールを送るのは先に保存できた 1 回だけにする
    const saved = await prisma.interviewPracticeSession.updateMany({
      where: { id: session.id, status: "active" },
      data: { status: "finished", feedback, finishedAt: new Date() },
    });
    if (saved.count === 0) {
      const again = await loadPracticeSession(token);
      const done = parseFeedback(again?.feedback);
      if (again && done) return Response.json(forCandidate(done, turns, again.feedbackEmailedAt !== null));
    }

    const mail = buildFeedbackEmail({
      name: session.user.name,
      level: session.level,
      industryKey: session.industry,
      feedback,
      practiceUrl: publicUrl("/interview-practice"),
    });
    const sent = await sendEmail({
      to: session.user.email,
      subject: mail.subject,
      text: mail.text,
      html: textToBasicHtml(mail.text),
    });
    await prisma.interviewPracticeSession.update({
      where: { id: session.id },
      data: sent.ok
        ? { feedbackEmailedAt: new Date(), feedbackEmailError: null }
        : { feedbackEmailError: sent.error.slice(0, 500) },
    });
    if (!sent.ok) console.error("[interview-practice] email failed", sent.error);

    return Response.json(forCandidate(feedback, turns, sent.ok));
  } catch (error) {
    console.error("[interview-practice] finish failed", error);
    return Response.json(
      { ok: false, error: "エラーが起きました。もう一度押してください。 / Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
