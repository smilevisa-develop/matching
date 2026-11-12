ALTER TABLE "Message" ADD COLUMN "lineMessageId" TEXT;
ALTER TABLE "Message" ADD COLUMN "quoteToken" TEXT;
ALTER TABLE "Message" ADD COLUMN "quotedLineMessageId" TEXT;
CREATE INDEX "Message_lineMessageId_idx" ON "Message"("lineMessageId");
