CREATE TABLE "PersonBilling" (
    "id" SERIAL NOT NULL,
    "personId" INTEGER NOT NULL,
    "unitPrice" INTEGER,
    "invoiceAmount" INTEGER,
    "invoiceDate" TEXT,
    "dueDate" TEXT,
    "invoiceStatus" TEXT,
    "paymentStatus" TEXT,
    "invoiceUrl" TEXT,
    "route" TEXT,
    "partnerName" TEXT,
    "partnerCost" INTEGER,
    "partnerInvoiceStatus" TEXT,
    "partnerPayStatus" TEXT,
    "partnerPaidDate" TEXT,
    "partnerInvoiceUrl" TEXT,
    "note" TEXT,
    "joinDate" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PersonBilling_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PersonBilling_personId_key" ON "PersonBilling"("personId");
ALTER TABLE "PersonBilling" ADD CONSTRAINT "PersonBilling_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
