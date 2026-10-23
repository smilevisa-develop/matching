-- 内定者管理: 書類作成のみを請け負った内定者 (ボードで薄く色を付けて出す)
ALTER TABLE "PersonPlacement" ADD COLUMN "documentsOnly" BOOLEAN NOT NULL DEFAULT false;
-- これまで「内定者を追加」で入れた人 (候補者とは別) は書類作成のみとして入れていた
UPDATE "PersonPlacement" SET "documentsOnly" = true WHERE "personId" IS NULL;
