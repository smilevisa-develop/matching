CREATE TABLE "FeedbackReport" (
    "id" SERIAL NOT NULL,
    "accountId" INTEGER,
    "accountName" TEXT,
    "pageUrl" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "bodyJa" TEXT,
    "imageIds" JSONB,
    "status" TEXT NOT NULL DEFAULT '未対応',
    "reply" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FeedbackReport_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "FeedbackReport_status_createdAt_idx" ON "FeedbackReport"("status", "createdAt");
