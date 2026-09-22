CREATE TABLE "IdempotencyKey" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IdempotencyKey_key_userId_projectId_key" ON "IdempotencyKey"("key", "userId", "projectId");
CREATE INDEX "IdempotencyKey_projectId_createdAt_idx" ON "IdempotencyKey"("projectId", "createdAt");
