/**
 * AI 面接練習のセッションまわり (サーバー専用)。
 *
 * 公開ページから誰でも始められる機能なので、無料枠を使い切られないように
 * 回数の上限をここで決めている。数字は運用しながら直してよい。
 */

import { randomBytes } from "node:crypto";
import { prisma } from "./prisma";
import { parseTurns, type PracticeProgress } from "./interview-practice";
import { isPracticeLevel, type PracticeLevel } from "./interview-practice-questions";

/** 同じ利用者が 24 時間に始められる回数 */
export const PRACTICE_LIMIT_PER_USER_PER_DAY = 3;
/** 全体で 24 時間に始められる回数 (月 50 人の想定に対して十分な余裕) */
export const PRACTICE_LIMIT_GLOBAL_PER_DAY = 40;
/** 始めてからこの時間を過ぎた練習は続きを受け付けない */
const SESSION_LIFETIME_MS = 2 * 60 * 60 * 1000;
/** 1 回の回答として受け付ける音声の大きさ (data URL の文字数) */
export const MAX_AUDIO_DATA_URL_LENGTH = 8 * 1024 * 1024;

export function newPracticeToken(): string {
  return randomBytes(24).toString("base64url");
}

/** いま新しい練習を始められるか。始められないときは候補者向けの理由を返す */
export async function checkPracticeLimit(userId: number | null): Promise<string | null> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const total = await prisma.interviewPracticeSession.count({ where: { createdAt: { gte: since } } });
  if (total >= PRACTICE_LIMIT_GLOBAL_PER_DAY) {
    return "今日の練習の受付は終了しました。明日また試してください。 / Today's practice slots are full. Please try again tomorrow.";
  }
  if (userId !== null) {
    const mine = await prisma.interviewPracticeSession.count({
      where: { userId, createdAt: { gte: since } },
    });
    if (mine >= PRACTICE_LIMIT_PER_USER_PER_DAY) {
      return `練習は 1 日 ${PRACTICE_LIMIT_PER_USER_PER_DAY} 回までです。明日また練習してください。 / You can practice ${PRACTICE_LIMIT_PER_USER_PER_DAY} times a day. Please come back tomorrow.`;
    }
  }
  return null;
}

export type LoadedPracticeSession = {
  id: number;
  level: PracticeLevel;
  industry: string;
  feedbackLanguage: string;
  status: string;
  feedback: unknown;
  feedbackEmailedAt: Date | null;
  updatedAt: Date;
  expired: boolean;
  progress: PracticeProgress;
  user: { name: string; email: string };
};

/** token から練習を読む (無ければ null) */
export async function loadPracticeSession(token: string): Promise<LoadedPracticeSession | null> {
  if (!token || token.length < 16) return null;
  const s = await prisma.interviewPracticeSession.findUnique({
    where: { token },
    include: { user: { select: { name: true, email: true } } },
  });
  if (!s || !isPracticeLevel(s.level)) return null;
  return {
    id: s.id,
    level: s.level,
    industry: s.industry,
    feedbackLanguage: s.feedbackLanguage,
    status: s.status,
    feedback: s.feedback,
    feedbackEmailedAt: s.feedbackEmailedAt,
    updatedAt: s.updatedAt,
    expired: Date.now() - s.createdAt.getTime() > SESSION_LIFETIME_MS,
    progress: {
      turns: parseTurns(s.turns),
      mainIndex: s.mainIndex,
      followupsUsed: s.followupsUsed,
    },
    user: s.user,
  };
}

/** Gemini の無料枠超過・混雑のエラーか (候補者には「少し待って」と案内する) */
export function isBusyError(e: unknown): boolean {
  const msg = String((e as { message?: string })?.message ?? e).toUpperCase();
  return /429|RESOURCE_EXHAUSTED|QUOTA|RATE LIMIT|503|UNAVAILABLE|OVERLOADED/.test(msg);
}

export const BUSY_MESSAGE =
  "いま利用が集中しています。1 分ほど待ってから、もう一度押してください。 / The service is busy. Please wait a minute and try again.";
