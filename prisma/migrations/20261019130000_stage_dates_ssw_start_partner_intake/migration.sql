-- 候補者ステージごとの日付 (進捗管理の月別集計 / スプシ反映用)
ALTER TABLE "DealCandidate" ADD COLUMN "stageDates" JSONB;

-- 既存データ: 接続日 = 紐づけた日、今のステージの日付 = 最後に動かした日 (日本時間)
UPDATE "DealCandidate"
SET "stageDates" = jsonb_build_object(
  '接続済み', to_char("createdAt" AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD'),
  "stage",   to_char("updatedAt" AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD')
)
WHERE "stageDates" IS NULL;

-- 特定技能の開始日 (推薦リストの通算期間)
ALTER TABLE "ResumeProfile" ADD COLUMN "sswStartDate" TEXT;

-- 新規パートナー自己記入フォームのトークン
ALTER TABLE "CoreSettings" ADD COLUMN "partnerIntakeToken" TEXT;
