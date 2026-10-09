-- 内定後管理ボード用。
-- 内定後の「やること・期限・担当」と「起きた問題」を記録できるようにする。
ALTER TABLE "PersonPlacement" ADD COLUMN "nextActionDueAt" TIMESTAMP(3);

CREATE TABLE "PlacementTask" (
  "id" SERIAL NOT NULL,
  "placementId" INTEGER NOT NULL,
  "category" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "dueAt" TIMESTAMP(3),
  "doneAt" TIMESTAMP(3),
  "doneBy" TEXT,
  "note" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlacementTask_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PlacementTask_placementId_sortOrder_idx" ON "PlacementTask"("placementId", "sortOrder");
ALTER TABLE "PlacementTask" ADD CONSTRAINT "PlacementTask_placementId_fkey"
  FOREIGN KEY ("placementId") REFERENCES "PersonPlacement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PlacementIssue" (
  "id" SERIAL NOT NULL,
  "placementId" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "detail" TEXT,
  "status" TEXT NOT NULL DEFAULT 'open',
  "recordedBy" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlacementIssue_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PlacementIssue_placementId_status_idx" ON "PlacementIssue"("placementId", "status");
ALTER TABLE "PlacementIssue" ADD CONSTRAINT "PlacementIssue_placementId_fkey"
  FOREIGN KEY ("placementId") REFERENCES "PersonPlacement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
