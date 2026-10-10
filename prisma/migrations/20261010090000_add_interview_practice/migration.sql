-- AI 面接練習 (候補者が公開ページから自分で登録して使う、練習専用の機能)。
-- 選考データ (Person) とは別の置き場にする。録音は保存せず、文字起こしとフィードバックだけを残す。

CREATE TABLE "InterviewPracticeUser" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nationality" TEXT NOT NULL,
    "gender" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InterviewPracticeUser_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InterviewPracticeUser_email_key" ON "InterviewPracticeUser"("email");

CREATE TABLE "InterviewPracticeSession" (
    "id" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "level" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "feedbackLanguage" TEXT NOT NULL,
    "turns" JSONB NOT NULL DEFAULT '[]',
    "mainIndex" INTEGER NOT NULL DEFAULT 0,
    "followupsUsed" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "feedback" JSONB,
    "feedbackEmailedAt" TIMESTAMP(3),
    "feedbackEmailError" TEXT,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InterviewPracticeSession_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InterviewPracticeSession_token_key" ON "InterviewPracticeSession"("token");
CREATE INDEX "InterviewPracticeSession_userId_createdAt_idx" ON "InterviewPracticeSession"("userId", "createdAt");
CREATE INDEX "InterviewPracticeSession_createdAt_idx" ON "InterviewPracticeSession"("createdAt");
ALTER TABLE "InterviewPracticeSession" ADD CONSTRAINT "InterviewPracticeSession_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "InterviewPracticeUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
