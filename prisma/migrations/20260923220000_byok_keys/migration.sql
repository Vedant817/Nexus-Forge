-- Per-user, per-provider LLM keys. Ciphertext only; the KEK never touches the DB.
CREATE TABLE "UserLlmKey" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING_VALIDATION',
  "ciphertextB64" TEXT NOT NULL,
  "ivB64" TEXT NOT NULL,
  "authTagB64" TEXT NOT NULL,
  "encVersion" TEXT NOT NULL DEFAULT 'v1',
  "kekId" TEXT NOT NULL DEFAULT 'primary',
  "keyFingerprint" TEXT NOT NULL,
  "prefixHint" TEXT NOT NULL DEFAULT '',
  "last4Hint" TEXT NOT NULL DEFAULT '',
  "validatedAt" TIMESTAMP(3),
  "lastCheckedAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "failureCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserLlmKey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserLlmKey_userId_provider_key" ON "UserLlmKey"("userId", "provider");
CREATE INDEX "UserLlmKey_userId_idx" ON "UserLlmKey"("userId");
CREATE INDEX "UserLlmKey_status_lastCheckedAt_idx" ON "UserLlmKey"("status", "lastCheckedAt");
ALTER TABLE "UserLlmKey" ADD CONSTRAINT "UserLlmKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiUsageEvent" ADD COLUMN "keySource" TEXT;
ALTER TABLE "AiUsageEvent" ADD COLUMN "keyFingerprint" TEXT;
