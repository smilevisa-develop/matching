CREATE TABLE "FixRequest" (
    "id" SERIAL NOT NULL,
    "channel" TEXT NOT NULL,
    "messageTs" TEXT NOT NULL,
    "threadTs" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "result" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    CONSTRAINT "FixRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "FixRequest_status_idx" ON "FixRequest"("status");
