-- SNS の相談リンクのクリックと、SNS から相談を始めた人を数える
ALTER TABLE "CoreSettings" ADD COLUMN "snsLinkTargets" JSONB;

CREATE TABLE "SnsLinkClick" (
    "id" SERIAL NOT NULL,
    "country" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SnsLinkClick_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SnsLinkClick_createdAt_idx" ON "SnsLinkClick"("createdAt");

CREATE TABLE "SnsInquiry" (
    "id" SERIAL NOT NULL,
    "country" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "userKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SnsInquiry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SnsInquiry_channel_userKey_key" ON "SnsInquiry"("channel", "userKey");
CREATE INDEX "SnsInquiry_createdAt_idx" ON "SnsInquiry"("createdAt");
