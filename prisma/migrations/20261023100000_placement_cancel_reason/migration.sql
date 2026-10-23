-- 内定者管理: 「キャンセル」(旧: 発行キャンセル) に入れたときの理由
ALTER TABLE "PersonPlacement" ADD COLUMN "cancelReason" TEXT;
