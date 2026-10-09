-- 内定者管理ボード v2: 滞留日数・保留列・内定フォロー担当
ALTER TABLE "PersonPlacement" ADD COLUMN "stageChangedAt" TIMESTAMP(3);
ALTER TABLE "PersonPlacement" ADD COLUMN "holdReason" TEXT;
ALTER TABLE "PersonPlacement" ADD COLUMN "heldFromStage" TEXT;
ALTER TABLE "PersonPlacement" ADD COLUMN "followUpOwnerId" INTEGER;
ALTER TABLE "PersonPlacement" ADD CONSTRAINT "PersonPlacement_followUpOwnerId_fkey"
  FOREIGN KEY ("followUpOwnerId") REFERENCES "StaffAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 既存ぶんは更新日時を工程開始日とみなす (滞留日数が出るように)
UPDATE "PersonPlacement" SET "stageChangedAt" = "updatedAt" WHERE "stageChangedAt" IS NULL;
