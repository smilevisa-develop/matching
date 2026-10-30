-- チャット画面: パートナーではない LINE グループ (内定後のグループなど) を、紐づけなしでチャットにだけ出す・ピン留めできるようにする
-- AlterTable
ALTER TABLE "LineGroup" ADD COLUMN     "chatOnly" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ChatPin" ADD COLUMN     "lineGroupId" TEXT,
ALTER COLUMN "partnerId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "ChatPin_accountId_lineGroupId_key" ON "ChatPin"("accountId", "lineGroupId");

-- AddForeignKey
ALTER TABLE "ChatPin" ADD CONSTRAINT "ChatPin_lineGroupId_fkey" FOREIGN KEY ("lineGroupId") REFERENCES "LineGroup"("groupId") ON DELETE CASCADE ON UPDATE CASCADE;

