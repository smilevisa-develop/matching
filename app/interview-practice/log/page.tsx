import { requireCurrentAccount } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { countAnswers, countQuestions, parseFeedback, parseTurns } from "@/lib/interview-practice";
import { findFeedbackLanguage, findPracticeIndustry } from "@/lib/interview-practice-questions";

export const dynamic = "force-dynamic";

/**
 * AI 面接練習の記録 (担当者用・ログイン必須)。
 * AI の聞き取りとフィードバックが妥当かを、人が確かめるためのページ。
 * 候補者には母国語で届くので、ここでは同じ内容の日本語の控えを見せる。
 */
export default async function InterviewPracticeLogPage() {
  await requireCurrentAccount();
  const sessions = await prisma.interviewPracticeSession.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { user: { select: { name: true, nationality: true, email: true } } },
  });

  return (
    <div className="space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-dark)]">AI面接練習の記録</h1>
        <p className="mt-1 text-sm text-gray-500">
          候補者が公開ページ（/interview-practice）で行った練習の、会話とフィードバックです。新しい順に 100
          件まで表示します。練習専用で、選考データには入りません。
        </p>
      </div>

      {sessions.length === 0 ? (
        <p className="rounded-2xl bg-white p-6 text-sm text-gray-500 shadow-sm">まだ練習の記録はありません。</p>
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => {
            const turns = parseTurns(s.turns);
            const feedback = parseFeedback(s.feedback);
            const industry = findPracticeIndustry(s.industry);
            const language = findFeedbackLanguage(s.feedbackLanguage);
            return (
              <details key={s.id} className="rounded-2xl bg-white p-5 shadow-sm">
                <summary className="cursor-pointer text-sm text-[var(--color-text-dark)]">
                  <span className="font-semibold">{s.user.name}</span>
                  <span className="ml-2 text-gray-500">
                    {s.user.nationality}・{s.level}・{industry?.label ?? s.industry}・
                    {s.createdAt.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}
                  </span>
                  <span className="ml-2 text-xs text-gray-400">
                    質問 {countQuestions(turns)}・回答 {countAnswers(turns)}・
                    {s.status === "finished" ? "完了" : "途中"}
                    {s.status === "finished"
                      ? s.feedbackEmailedAt
                        ? "・メール送信済み"
                        : "・メール未送信"
                      : ""}
                  </span>
                </summary>

                <div className="mt-4 grid gap-6 lg:grid-cols-2">
                  <div>
                    <h2 className="text-xs font-semibold text-gray-500">会話（AI の聞き取り）</h2>
                    <div className="mt-2 space-y-2 text-[13px] leading-relaxed">
                      {turns.map((t, i) =>
                        t.role === "interviewer" ? (
                          <p key={i} className="text-gray-500">
                            <span className="font-semibold">
                              面接官{t.kind === "followup" ? "（深掘り）" : t.kind === "retry" ? "（聞き返し）" : ""}:{" "}
                            </span>
                            {t.text}
                          </p>
                        ) : (
                          <p key={i} className="text-[var(--color-text-dark)]">
                            <span className="font-semibold">候補者: </span>
                            {t.text || (t.audioIssue === "silent" ? "（無音）" : "（聞き取れず）")}
                            {t.seconds ? <span className="ml-1 text-xs text-gray-400">{Math.round(t.seconds)}秒</span> : null}
                          </p>
                        ),
                      )}
                    </div>
                  </div>

                  <div>
                    <h2 className="text-xs font-semibold text-gray-500">
                      フィードバック（日本語の控え / 候補者には{language?.label ?? s.feedbackLanguage}で送付）
                    </h2>
                    {feedback ? (
                      <div className="mt-2 space-y-3 text-[13px] leading-relaxed text-[var(--color-text-dark)]">
                        <p>{feedback.summaryJa}</p>
                        {feedback.strengths.length > 0 ? (
                          <div>
                            <p className="font-semibold">よかった点</p>
                            <ul className="list-disc pl-5">
                              {feedback.strengths.map((x, i) => (
                                <li key={i}>{x.ja}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                        {feedback.improvements.length > 0 ? (
                          <div>
                            <p className="font-semibold">もっと良くなる点</p>
                            <ol className="list-decimal space-y-2 pl-5">
                              {feedback.improvements.map((x, i) => (
                                <li key={i}>
                                  <span className="text-gray-500">「{x.question}」</span>
                                  <br />
                                  {x.ja}
                                  {x.exampleAnswerJa ? (
                                    <span className="mt-1 block rounded-lg bg-[var(--color-light)] px-3 py-2">
                                      回答例: {x.exampleAnswerJa}
                                    </span>
                                  ) : null}
                                </li>
                              ))}
                            </ol>
                          </div>
                        ) : null}
                        {feedback.adviceJa ? (
                          <p>
                            <span className="font-semibold">アドバイス: </span>
                            {feedback.adviceJa}
                          </p>
                        ) : null}
                        <details className="text-gray-500">
                          <summary className="cursor-pointer text-xs">候補者に送った文面を見る</summary>
                          <div className="mt-2 space-y-2 whitespace-pre-wrap">
                            <p>{feedback.summaryNative}</p>
                            {feedback.strengths.map((x, i) => (
                              <p key={`s${i}`}>・{x.native}</p>
                            ))}
                            {feedback.improvements.map((x, i) => (
                              <p key={`i${i}`}>
                                {i + 1}. {x.native}
                              </p>
                            ))}
                            <p>{feedback.adviceNative}</p>
                          </div>
                        </details>
                        {s.feedbackEmailError ? (
                          <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                            メールを送れませんでした: {s.feedbackEmailError}
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <p className="mt-2 text-[13px] text-gray-500">
                        フィードバックはまだありません（練習の途中で閉じた可能性があります）。
                      </p>
                    )}
                    <p className="mt-3 text-xs text-gray-400">{s.user.email}</p>
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}
