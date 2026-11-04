-- SNS の数字: Meta アプリとユーザートークン (lib/sns-meta-connect.ts)
ALTER TABLE "CoreSettings" ADD COLUMN "snsMetaAppId" TEXT;
ALTER TABLE "CoreSettings" ADD COLUMN "snsMetaAppSecret" TEXT;
ALTER TABLE "CoreSettings" ADD COLUMN "snsMetaToken" TEXT;
ALTER TABLE "CoreSettings" ADD COLUMN "snsMetaTokenExpiresAt" TIMESTAMP(3);
