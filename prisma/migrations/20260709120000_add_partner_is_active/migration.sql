-- Partner に isActive を追加。デフォルト true。
-- 既存データは連絡先 (LINE/Messenger/WhatsApp/LineGroup) or email があれば active、
-- そうでなければ inactive にバックフィル。
ALTER TABLE "Partner" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;

UPDATE "Partner"
SET "isActive" = false
WHERE
  ("email" IS NULL OR "email" = '' OR "email" !~ '@')
  AND "lineUserId" IS NULL
  AND "messengerPsid" IS NULL
  AND "whatsappId" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "LineGroup" g WHERE g."partnerId" = "Partner"."id"
  );
