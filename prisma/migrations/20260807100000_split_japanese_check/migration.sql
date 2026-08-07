-- 日本語チェックを入力フォームから切り離すための追加。
-- 1. 候補者に「日本語チェック専用」の共有トークンを持たせる (intakeToken とは別リンク)
ALTER TABLE "Person" ADD COLUMN "japaneseCheckToken" TEXT;
CREATE UNIQUE INDEX "Person_japaneseCheckToken_key" ON "Person"("japaneseCheckToken");

-- 2. 判定の根拠を保存する (AI は事実の観察のみ、レベルはコードのルールで決めるため
--    後から「なぜこの判定か」を検証できるようにする)
ALTER TABLE "PersonJapaneseCheck" ADD COLUMN "levelReason" TEXT;
ALTER TABLE "PersonJapaneseCheck" ADD COLUMN "confidence" TEXT;
ALTER TABLE "PersonJapaneseCheck" ADD COLUMN "evidence" JSONB;
