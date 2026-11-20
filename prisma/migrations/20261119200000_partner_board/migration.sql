-- AlterTable
ALTER TABLE "Partner" ADD COLUMN     "boardEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "boardToken" TEXT,
ADD COLUMN     "licenseNumber" TEXT;

-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "boardArea" TEXT,
ADD COLUMN     "boardJobChangeScope" TEXT,
ADD COLUMN     "boardPartnerFee" TEXT,
ADD COLUMN     "boardPerPartnerLimit" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "boardPlaceChangeScope" TEXT,
ADD COLUMN     "boardPublishedAt" TIMESTAMP(3),
ADD COLUMN     "boardRenewalLimit" TEXT,
ADD COLUMN     "boardRequirements" JSONB,
ADD COLUMN     "boardStatus" TEXT NOT NULL DEFAULT 'hidden',
ADD COLUMN     "boardSummary" TEXT,
ADD COLUMN     "boardTitle" TEXT,
ADD COLUMN     "boardTotalLimit" INTEGER;

-- CreateTable
CREATE TABLE "BoardRecommendation" (
    "id" SERIAL NOT NULL,
    "dealId" INTEGER NOT NULL,
    "partnerId" INTEGER NOT NULL,
    "candidateName" TEXT NOT NULL,
    "nationality" TEXT,
    "age" INTEGER,
    "gender" TEXT,
    "residence" TEXT,
    "residenceStatus" TEXT,
    "japaneseLevel" TEXT,
    "experience" TEXT,
    "resumeUrl" TEXT,
    "note" TEXT,
    "checks" JSONB,
    "status" TEXT NOT NULL DEFAULT '受付',
    "statusNote" TEXT,
    "personId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoardRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoardQuestion" (
    "id" SERIAL NOT NULL,
    "dealId" INTEGER NOT NULL,
    "partnerId" INTEGER,
    "question" TEXT NOT NULL,
    "answer" TEXT,
    "answeredAt" TIMESTAMP(3),
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BoardQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BoardRecommendation_dealId_idx" ON "BoardRecommendation"("dealId");

-- CreateIndex
CREATE INDEX "BoardRecommendation_partnerId_idx" ON "BoardRecommendation"("partnerId");

-- CreateIndex
CREATE INDEX "BoardQuestion_dealId_idx" ON "BoardQuestion"("dealId");

-- CreateIndex
CREATE UNIQUE INDEX "Partner_boardToken_key" ON "Partner"("boardToken");

-- AddForeignKey
ALTER TABLE "BoardRecommendation" ADD CONSTRAINT "BoardRecommendation_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardRecommendation" ADD CONSTRAINT "BoardRecommendation_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardQuestion" ADD CONSTRAINT "BoardQuestion_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardQuestion" ADD CONSTRAINT "BoardQuestion_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

