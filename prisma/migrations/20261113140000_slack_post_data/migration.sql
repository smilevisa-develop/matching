-- PA の請求書を選んでもらうあいだ、貼られたファイルを覚えておく
ALTER TABLE "SlackBillingPost" ADD COLUMN "data" JSONB;
