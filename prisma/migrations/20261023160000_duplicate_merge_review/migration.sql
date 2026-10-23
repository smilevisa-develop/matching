-- 重複していた候補者をまとめた結果を、担当者が確認するための一時的な表 (/duplicates)
CREATE TABLE "DuplicateMergeReview" (
  "id" SERIAL NOT NULL,
  "keptId" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT '未確認',
  "note" TEXT,
  "reviewedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DuplicateMergeReview_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DuplicateMergeReview_keptId_key" ON "DuplicateMergeReview"("keptId");
