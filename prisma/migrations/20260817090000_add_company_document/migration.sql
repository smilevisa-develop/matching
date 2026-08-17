-- 内定後の「事前確認資料」を候補者に母国語で確認してもらう仕組み。
-- 企業ごとに資料を 1 度登録し (CompanyDocument)、候補者へ配信する (CompanyDocumentDelivery)。

CREATE TABLE "CompanyDocument" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "sourceText" TEXT NOT NULL,
    "sections" JSONB NOT NULL,
    "translations" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CompanyDocument_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CompanyDocument_companyId_idx" ON "CompanyDocument"("companyId");
ALTER TABLE "CompanyDocument" ADD CONSTRAINT "CompanyDocument_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CompanyDocumentDelivery" (
    "id" SERIAL NOT NULL,
    "personId" INTEGER NOT NULL,
    "documentId" INTEGER NOT NULL,
    "language" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "sentAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "checkedItems" JSONB,
    "unclearItems" JSONB,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CompanyDocumentDelivery_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CompanyDocumentDelivery_token_key" ON "CompanyDocumentDelivery"("token");
CREATE INDEX "CompanyDocumentDelivery_personId_idx" ON "CompanyDocumentDelivery"("personId");
CREATE INDEX "CompanyDocumentDelivery_documentId_idx" ON "CompanyDocumentDelivery"("documentId");
ALTER TABLE "CompanyDocumentDelivery" ADD CONSTRAINT "CompanyDocumentDelivery_personId_fkey"
    FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyDocumentDelivery" ADD CONSTRAINT "CompanyDocumentDelivery_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "CompanyDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
