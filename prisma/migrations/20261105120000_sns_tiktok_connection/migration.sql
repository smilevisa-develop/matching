-- SNS の数字: TikTok アプリと接続したアカウント (lib/sns-tiktok.ts)
ALTER TABLE "CoreSettings" ADD COLUMN "snsTiktokClientKey" TEXT;
ALTER TABLE "CoreSettings" ADD COLUMN "snsTiktokClientSecret" TEXT;
ALTER TABLE "CoreSettings" ADD COLUMN "snsTiktokAccounts" JSONB;
