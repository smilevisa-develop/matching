-- パートナーアンケート: パートナーごとのリンクと回答 (lib/partner-survey.ts)
ALTER TABLE "Partner" ADD COLUMN "surveyToken" TEXT;
ALTER TABLE "Partner" ADD COLUMN "surveyAnsweredAt" TIMESTAMP(3);
ALTER TABLE "Partner" ADD COLUMN "surveyAnswers" JSONB;
CREATE UNIQUE INDEX "Partner_surveyToken_key" ON "Partner"("surveyToken");
