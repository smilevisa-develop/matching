-- 内定者管理: 別の在留資格でもう一度申請する人 (請求は 1 回目の入社のときだけ)
ALTER TABLE "PersonPlacement" ADD COLUMN "twoApplications" BOOLEAN NOT NULL DEFAULT false;
