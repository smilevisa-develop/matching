-- スプシ DB への反映済み日時。
-- 既存候補者は「現在時刻で反映済み」とみなし、今後の変更だけがスプシに流れるようにする。
-- (スプシの古いデータを保護するため、移行時点で一括同期はしない)
ALTER TABLE "Person" ADD COLUMN IF NOT EXISTS "sheetSyncedAt" TIMESTAMP(3);

UPDATE "Person" SET "sheetSyncedAt" = NOW() WHERE "sheetSyncedAt" IS NULL;
