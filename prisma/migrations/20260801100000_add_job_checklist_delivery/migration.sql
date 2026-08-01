-- 母国語求人票チェックリストの配信記録
CREATE TABLE "JobChecklistDelivery" (
  "id" SERIAL NOT NULL,
  "personId" INTEGER NOT NULL,
  "companyId" INTEGER NOT NULL,
  "language" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "items" JSONB NOT NULL,
  "sentAt" TIMESTAMP(3),
  "openedAt" TIMESTAMP(3),
  "checkedItems" JSONB,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "JobChecklistDelivery_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "JobChecklistDelivery_token_key" ON "JobChecklistDelivery"("token");
CREATE INDEX "JobChecklistDelivery_personId_idx" ON "JobChecklistDelivery"("personId");
CREATE INDEX "JobChecklistDelivery_companyId_idx" ON "JobChecklistDelivery"("companyId");
ALTER TABLE "JobChecklistDelivery" ADD CONSTRAINT "JobChecklistDelivery_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobChecklistDelivery" ADD CONSTRAINT "JobChecklistDelivery_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
