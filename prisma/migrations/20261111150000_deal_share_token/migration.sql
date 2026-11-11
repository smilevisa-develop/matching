ALTER TABLE "Deal" ADD COLUMN "shareToken" TEXT;
CREATE UNIQUE INDEX "Deal_shareToken_key" ON "Deal"("shareToken");
