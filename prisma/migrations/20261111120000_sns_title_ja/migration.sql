CREATE TABLE "SnsTitleJa" (
    "key" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "ja" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SnsTitleJa_pkey" PRIMARY KEY ("key")
);
