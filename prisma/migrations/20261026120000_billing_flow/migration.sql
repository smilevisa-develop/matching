-- 請求の流れ (入社 → 翌月1日に請求 → 月末入金 → パートナーに請求書依頼 → 翌月末支払い)
ALTER TABLE "PlacementTask" ADD COLUMN "owner" TEXT;
ALTER TABLE "PlacementTask" ADD COLUMN "billingStep" TEXT;
ALTER TABLE "CoreSettings" ADD COLUMN "billingOwnerId" INTEGER;
