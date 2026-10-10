/**
 * AI 面接練習を始める (公開・未ログイン可)。
 *
 * POST /api/interview-practice/start
 *   body: { name, nationality, gender, email, level, industry, feedbackLanguage, consent }
 *   → { ok, token, say, questionNumber, maxQuestions, turnCount }
 *
 * 候補者が自分で登録する。同じメールアドレスは同じ利用者として扱い、
 * 選考データ (Person) には書き込まない。1 問目は質問集から出すので AI は呼ばない。
 */

import { prisma } from "@/lib/prisma";
import { GENDERS } from "@/lib/candidate-profile";
import { countQuestions, startPractice } from "@/lib/interview-practice";
import {
  findFeedbackLanguage,
  findPracticeIndustry,
  isPracticeLevel,
  maxQuestionCount,
} from "@/lib/interview-practice-questions";
import { checkPracticeLimit, newPracticeToken } from "@/lib/interview-practice-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function text(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return Response.json({ ok: false, error: "入力内容を読み取れませんでした" }, { status: 400 });

    const name = text(body.name, 80);
    const nationality = text(body.nationality, 40);
    const gender = text(body.gender, 20);
    const email = text(body.email, 254).toLowerCase();
    const industry = findPracticeIndustry(body.industry);
    const language = findFeedbackLanguage(body.feedbackLanguage);

    if (!name || !nationality || !GENDERS.includes(gender)) {
      return Response.json(
        { ok: false, error: "名前・国籍・性別を入力してください。 / Please fill in your name, nationality and gender." },
        { status: 400 },
      );
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json(
        { ok: false, error: "メールアドレスを確認してください。 / Please check your email address." },
        { status: 400 },
      );
    }
    if (!isPracticeLevel(body.level) || !industry || !language) {
      return Response.json(
        { ok: false, error: "レベル・分野・言語を選んでください。 / Please choose a level, field and language." },
        { status: 400 },
      );
    }
    if (body.consent !== true) {
      return Response.json(
        { ok: false, error: "同意のチェックが必要です。 / Please check the consent box." },
        { status: 400 },
      );
    }
    const level = body.level;

    const existing = await prisma.interviewPracticeUser.findUnique({
      where: { email },
      select: { id: true },
    });
    const limited = await checkPracticeLimit(existing?.id ?? null);
    if (limited) return Response.json({ ok: false, error: limited }, { status: 429 });

    const user = await prisma.interviewPracticeUser.upsert({
      where: { email },
      create: { email, name, nationality, gender },
      update: { name, nationality, gender },
      select: { id: true },
    });

    const progress = startPractice(level, industry.key);
    const session = await prisma.interviewPracticeSession.create({
      data: {
        token: newPracticeToken(),
        userId: user.id,
        level,
        industry: industry.key,
        feedbackLanguage: language.code,
        turns: progress.turns,
        mainIndex: progress.mainIndex,
        followupsUsed: progress.followupsUsed,
      },
      select: { token: true },
    });

    return Response.json({
      ok: true,
      token: session.token,
      say: progress.turns[0].text,
      questionNumber: countQuestions(progress.turns),
      maxQuestions: maxQuestionCount(level, industry.key),
      turnCount: progress.turns.length,
    });
  } catch (error) {
    console.error("[interview-practice] start failed", error);
    return Response.json(
      { ok: false, error: "練習を始められませんでした。もう一度お試しください。 / Could not start. Please try again." },
      { status: 500 },
    );
  }
}
