-- 日本語チェックを「1 回のみ受験」にするための記録。
-- 開始済み / 送信済みのリンクではやり直せない (管理画面の「再発行」で両方 null に戻す)。
ALTER TABLE "Person" ADD COLUMN "japaneseCheckStartedAt" TIMESTAMP(3);
ALTER TABLE "Person" ADD COLUMN "japaneseCheckSubmittedAt" TIMESTAMP(3);

-- 既に録音を送ってきた候補者は受験済みとして扱う (今のリンクで再受験させない)
UPDATE "Person" p
SET "japaneseCheckStartedAt" = j."createdAt",
    "japaneseCheckSubmittedAt" = j."createdAt"
FROM "PersonJapaneseCheck" j
WHERE j."personId" = p.id;
