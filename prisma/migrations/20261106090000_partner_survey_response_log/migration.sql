-- CreateTable
CREATE TABLE "PartnerSurveyResponseLog" (
    "id" SERIAL NOT NULL,
    "partnerId" INTEGER NOT NULL,
    "companyName" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "applied" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerSurveyResponseLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PartnerSurveyResponseLog_partnerId_createdAt_idx" ON "PartnerSurveyResponseLog"("partnerId", "createdAt");

-- AddForeignKey
ALTER TABLE "PartnerSurveyResponseLog" ADD CONSTRAINT "PartnerSurveyResponseLog_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
