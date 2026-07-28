-- 事前面談前の日本語チェック結果
CREATE TABLE IF NOT EXISTS "PersonJapaneseCheck" (
  "id" SERIAL PRIMARY KEY,
  "personId" INTEGER NOT NULL UNIQUE,
  "estimatedLevel" TEXT,
  "pronunciation" INTEGER,
  "fluency" INTEGER,
  "vocabulary" INTEGER,
  "grammar" INTEGER,
  "summary" TEXT,
  "recordings" JSONB,
  "assessedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PersonJapaneseCheck_personId_fkey"
    FOREIGN KEY ("personId") REFERENCES "Person"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);
