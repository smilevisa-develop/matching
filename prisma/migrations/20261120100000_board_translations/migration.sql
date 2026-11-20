-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "boardTranslations" JSONB;

-- AlterTable
ALTER TABLE "BoardQuestion" ADD COLUMN     "translations" JSONB;
