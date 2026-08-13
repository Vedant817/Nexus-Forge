-- CreateEnum
CREATE TYPE "AnalysisRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'CANCEL_REQUESTED', 'CANCELLED', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "AnalysisStageName" AS ENUM ('KNOWLEDGE', 'REPOSITORY', 'WORKFLOW', 'RELEASE', 'PROOF');

-- CreateEnum
CREATE TYPE "AnalysisStageStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "JobKind" AS ENUM ('ANALYSIS', 'WEBHOOK');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'RETRY_WAIT', 'SUCCEEDED', 'DEAD', 'CANCELLED');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "activeAnalysisRunId" TEXT;

-- AlterTable
ALTER TABLE "WebhookDelivery" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastErrorAt" TIMESTAMP(3),
ADD COLUMN     "lastErrorCode" TEXT;

-- CreateTable
CREATE TABLE "AnalysisRun" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "status" "AnalysisRunStatus" NOT NULL DEFAULT 'QUEUED',
    "inputSnapshot" JSONB NOT NULL,
    "inputHash" TEXT NOT NULL,
    "commitSha" TEXT,
    "pipelineVersion" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "modelConfigVersion" TEXT NOT NULL,
    "modelConfig" JSONB NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "failureClass" TEXT,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelRequestedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalysisRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisStageRun" (
    "id" TEXT NOT NULL,
    "analysisRunId" TEXT NOT NULL,
    "stage" "AnalysisStageName" NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "status" "AnalysisStageStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "inputHash" TEXT,
    "outputHash" TEXT,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "failureClass" TEXT,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalysisStageRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "kind" "JobKind" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "projectId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "analysisRunId" TEXT,
    "webhookDeliveryId" TEXT,
    "payload" JSONB,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseOwner" TEXT,
    "leaseToken" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "heartbeatAt" TIMESTAMP(3),
    "failureClass" TEXT,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArtifactVersion" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "analysisRunId" TEXT,
    "analysisStageRunId" TEXT,
    "webhookDeliveryId" TEXT,
    "kind" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "content" JSONB NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArtifactVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnalysisRun_projectId_createdAt_idx" ON "AnalysisRun"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "AnalysisRun_ownerId_createdAt_idx" ON "AnalysisRun"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "AnalysisRun_status_queuedAt_idx" ON "AnalysisRun"("status", "queuedAt");

-- CreateIndex
CREATE INDEX "AnalysisStageRun_analysisRunId_status_idx" ON "AnalysisStageRun"("analysisRunId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AnalysisStageRun_analysisRunId_stage_key" ON "AnalysisStageRun"("analysisRunId", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "AnalysisStageRun_analysisRunId_ordinal_key" ON "AnalysisStageRun"("analysisRunId", "ordinal");

-- CreateIndex
CREATE UNIQUE INDEX "Job_leaseToken_key" ON "Job"("leaseToken");

-- CreateIndex
CREATE INDEX "Job_status_availableAt_idx" ON "Job"("status", "availableAt");

-- CreateIndex
CREATE INDEX "Job_leaseExpiresAt_idx" ON "Job"("leaseExpiresAt");

-- CreateIndex
CREATE INDEX "Job_projectId_createdAt_idx" ON "Job"("projectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Job_analysisRunId_key" ON "Job"("analysisRunId");

-- CreateIndex
CREATE UNIQUE INDEX "Job_webhookDeliveryId_key" ON "Job"("webhookDeliveryId");

-- CreateIndex
CREATE INDEX "ArtifactVersion_projectId_createdAt_idx" ON "ArtifactVersion"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "ArtifactVersion_analysisStageRunId_idx" ON "ArtifactVersion"("analysisStageRunId");

-- CreateIndex
CREATE UNIQUE INDEX "ArtifactVersion_analysisRunId_kind_schemaVersion_key" ON "ArtifactVersion"("analysisRunId", "kind", "schemaVersion");

-- CreateIndex
CREATE UNIQUE INDEX "ArtifactVersion_webhookDeliveryId_kind_schemaVersion_key" ON "ArtifactVersion"("webhookDeliveryId", "kind", "schemaVersion");

-- CreateIndex
CREATE UNIQUE INDEX "Project_activeAnalysisRunId_key" ON "Project"("activeAnalysisRunId");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_activeAnalysisRunId_fkey" FOREIGN KEY ("activeAnalysisRunId") REFERENCES "AnalysisRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisRun" ADD CONSTRAINT "AnalysisRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisRun" ADD CONSTRAINT "AnalysisRun_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisStageRun" ADD CONSTRAINT "AnalysisStageRun_analysisRunId_fkey" FOREIGN KEY ("analysisRunId") REFERENCES "AnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_analysisRunId_fkey" FOREIGN KEY ("analysisRunId") REFERENCES "AnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_webhookDeliveryId_fkey" FOREIGN KEY ("webhookDeliveryId") REFERENCES "WebhookDelivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArtifactVersion" ADD CONSTRAINT "ArtifactVersion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArtifactVersion" ADD CONSTRAINT "ArtifactVersion_analysisRunId_fkey" FOREIGN KEY ("analysisRunId") REFERENCES "AnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArtifactVersion" ADD CONSTRAINT "ArtifactVersion_analysisStageRunId_fkey" FOREIGN KEY ("analysisStageRunId") REFERENCES "AnalysisStageRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArtifactVersion" ADD CONSTRAINT "ArtifactVersion_webhookDeliveryId_fkey" FOREIGN KEY ("webhookDeliveryId") REFERENCES "WebhookDelivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One active analysis run per project. This partial index is intentionally
-- represented in SQL because Prisma schema syntax cannot express it.
CREATE UNIQUE INDEX "AnalysisRun_one_active_per_project"
ON "AnalysisRun" ("projectId")
WHERE "status" IN ('QUEUED', 'RUNNING', 'CANCEL_REQUESTED');

-- Artifact content is append-only. Cascading deletes remain possible for project
-- retention/deletion, but an existing version cannot be mutated in place.
CREATE FUNCTION "prevent_artifact_version_update"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ArtifactVersion rows are immutable; insert a new schema version instead';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ArtifactVersion_immutable_update"
BEFORE UPDATE ON "ArtifactVersion"
FOR EACH ROW EXECUTE FUNCTION "prevent_artifact_version_update"();

-- Durable jobs must reference exactly one consumer matching their kind.
ALTER TABLE "Job" ADD CONSTRAINT "Job_kind_consumer_check" CHECK (
  ("kind" = 'ANALYSIS' AND "analysisRunId" IS NOT NULL AND "webhookDeliveryId" IS NULL)
  OR
  ("kind" = 'WEBHOOK' AND "analysisRunId" IS NULL AND "webhookDeliveryId" IS NOT NULL)
);

CREATE INDEX "AnalysisRun_id_projectId_ownerId_idx" ON "AnalysisRun"("id", "projectId", "ownerId");
CREATE INDEX "Job_id_projectId_ownerId_kind_idx" ON "Job"("id", "projectId", "ownerId", "kind");
