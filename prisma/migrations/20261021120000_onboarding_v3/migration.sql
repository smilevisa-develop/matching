-- 企業: 自社支援 / 委託管理 (委託管理の内定者はボードに出さない)
ALTER TABLE "Company" ADD COLUMN "supportType" TEXT NOT NULL DEFAULT '自社支援';

-- 内定者管理: 候補者に紐づかない内定者 (書類作成のみ) を持てるようにする
ALTER TABLE "PersonPlacement" ALTER COLUMN "personId" DROP NOT NULL;
ALTER TABLE "PersonPlacement" ADD COLUMN "externalName" TEXT;
ALTER TABLE "PersonPlacement" ADD COLUMN "externalCompanyName" TEXT;
ALTER TABLE "PersonPlacement" ADD COLUMN "externalResidenceStatus" TEXT;
ALTER TABLE "PersonPlacement" ADD COLUMN "applicationMethod" TEXT;
ALTER TABLE "PersonPlacement" ADD COLUMN "supports" JSONB;

-- 工程の名前変更: 在留カード → 発行手続き中 / 渡航・住居 → サポート
UPDATE "PersonPlacement" SET "stage" = 'card_processing' WHERE "stage" IN ('result', 'approved');
UPDATE "PersonPlacement" SET "stage" = 'support' WHERE "stage" IN ('arrival', 'entered', 'joining');
UPDATE "PersonPlacement" SET "heldFromStage" = 'card_processing' WHERE "heldFromStage" = 'result';
UPDATE "PersonPlacement" SET "heldFromStage" = 'support' WHERE "heldFromStage" = 'arrival';
