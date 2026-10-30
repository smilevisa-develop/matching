-- チャット画面のピン留め (担当者ごと)
-- CreateTable
CREATE TABLE "ChatPin" (
    "id" SERIAL NOT NULL,
    "accountId" INTEGER NOT NULL,
    "partnerId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatPin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChatPin_accountId_partnerId_key" ON "ChatPin"("accountId", "partnerId");

-- AddForeignKey
ALTER TABLE "ChatPin" ADD CONSTRAINT "ChatPin_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "StaffAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatPin" ADD CONSTRAINT "ChatPin_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

