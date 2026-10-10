-- AI 面接練習で面接官が話す音声 (AI の音声合成) の置き場。
-- 同じ文は 1 度だけ作り、以後はここから配る。

CREATE TABLE "InterviewPracticeSpeech" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "voice" TEXT NOT NULL,
    "fixed" BOOLEAN NOT NULL DEFAULT false,
    "audio" BYTEA,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InterviewPracticeSpeech_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InterviewPracticeSpeech_key_key" ON "InterviewPracticeSpeech"("key");
CREATE INDEX "InterviewPracticeSpeech_fixed_createdAt_idx" ON "InterviewPracticeSpeech"("fixed", "createdAt");
