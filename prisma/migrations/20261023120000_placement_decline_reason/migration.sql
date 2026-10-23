-- 内定者管理: 「内定辞退」に入れたときの理由 (内定辞退の人はボードから消える)
ALTER TABLE "PersonPlacement" ADD COLUMN "declineReason" TEXT;
