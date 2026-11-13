-- Slack の請求スレッドにアプリが出した投稿 (✅ を押されたら、その人の段階を済にする)
CREATE TABLE "SlackBillingPost" (
    "id" SERIAL NOT NULL,
    "channel" TEXT NOT NULL,
    "ts" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "personIds" INTEGER[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SlackBillingPost_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SlackBillingPost_channel_ts_key" ON "SlackBillingPost"("channel", "ts");

-- 同じ Slack のイベントを 2 回処理しない
CREATE TABLE "SlackEventSeen" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SlackEventSeen_pkey" PRIMARY KEY ("id")
);
