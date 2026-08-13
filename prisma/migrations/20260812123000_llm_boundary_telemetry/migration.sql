-- Add stage-specific execution identity and safe model-boundary telemetry.
ALTER TABLE "AnalysisStageRun"
  ADD COLUMN "promptId" TEXT,
  ADD COLUMN "promptVersion" TEXT,
  ADD COLUMN "agentSchemaVersion" TEXT,
  ADD COLUMN "requestedProvider" TEXT,
  ADD COLUMN "requestedModel" TEXT;

ALTER TABLE "ArtifactVersion"
  ADD COLUMN "promptId" TEXT,
  ADD COLUMN "promptVersion" TEXT,
  ADD COLUMN "agentSchemaVersion" TEXT,
  ADD COLUMN "requestedProvider" TEXT,
  ADD COLUMN "requestedModel" TEXT;

CREATE TYPE "AiReservationStatus" AS ENUM ('RESERVED', 'RECONCILED', 'RELEASED');

CREATE TABLE "AiTokenReservation" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "projectId" TEXT,
  "userBucketKey" TEXT NOT NULL,
  "projectBucketKey" TEXT,
  "operation" TEXT NOT NULL,
  "reservedTokens" INTEGER NOT NULL,
  "actualTokens" INTEGER,
  "status" "AiReservationStatus" NOT NULL DEFAULT 'RESERVED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "settledAt" TIMESTAMP(3),
  CONSTRAINT "AiTokenReservation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AiTokenReservation_userId_createdAt_idx" ON "AiTokenReservation"("userId", "createdAt");
CREATE INDEX "AiTokenReservation_projectId_createdAt_idx" ON "AiTokenReservation"("projectId", "createdAt");
CREATE INDEX "AiTokenReservation_status_createdAt_idx" ON "AiTokenReservation"("status", "createdAt");

ALTER TABLE "AiUsageEvent"
  ADD COLUMN "requestedProvider" TEXT NOT NULL DEFAULT 'groq',
  ADD COLUMN "responseProvider" TEXT,
  ADD COLUMN "success" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "errorCode" TEXT,
  ADD COLUMN "latencyMs" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "pipelineVersion" TEXT,
  ADD COLUMN "promptId" TEXT,
  ADD COLUMN "promptVersion" TEXT,
  ADD COLUMN "schemaVersion" TEXT,
  ADD COLUMN "finishReason" TEXT,
  ADD COLUMN "responseId" TEXT,
  ADD COLUMN "attemptCount" INTEGER,
  ADD COLUMN "reservationId" TEXT;

CREATE UNIQUE INDEX "AiUsageEvent_reservationId_key" ON "AiUsageEvent"("reservationId");
ALTER TABLE "AiUsageEvent" ADD CONSTRAINT "AiUsageEvent_reservationId_fkey"
  FOREIGN KEY ("reservationId") REFERENCES "AiTokenReservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AiUsageEvent"
  ALTER COLUMN "requestedProvider" DROP DEFAULT,
  ALTER COLUMN "success" DROP DEFAULT,
  ALTER COLUMN "latencyMs" DROP DEFAULT;
