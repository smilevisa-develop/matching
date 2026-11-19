-- 企業との商談の議事録 (Notta → Zapier → スプシ から、企業の画面のボタンで取り込む)
CREATE TABLE "MeetingNote" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "meetingAt" TIMESTAMP(3),
    "meetingAtText" TEXT,
    "summary" TEXT,
    "transcript" TEXT,
    "url" TEXT,
    "dismissedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MeetingNote_companyId_sourceKey_key" ON "MeetingNote"("companyId", "sourceKey");

-- CreateIndex
CREATE INDEX "MeetingNote_companyId_meetingAt_idx" ON "MeetingNote"("companyId", "meetingAt");

-- AddForeignKey
ALTER TABLE "MeetingNote" ADD CONSTRAINT "MeetingNote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
