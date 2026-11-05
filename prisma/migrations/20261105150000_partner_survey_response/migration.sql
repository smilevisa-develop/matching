-- パートナーアンケート: 回答そのもの (相手が入れた会社名つき) と、反映した日時
ALTER TABLE "Partner" ADD COLUMN "surveyResponse" JSONB;
ALTER TABLE "Partner" ADD COLUMN "surveyAppliedAt" TIMESTAMP(3);
