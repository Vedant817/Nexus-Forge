ALTER TABLE "Project"
  ADD COLUMN "githubRepositoryPrivate" BOOLEAN,
  ADD COLUMN "externalInferenceEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "externalInferenceAuthorizedBy" TEXT,
  ADD COLUMN "externalInferenceAuthorizedAt" TIMESTAMP(3),
  ADD COLUMN "externalInferenceAckVersion" TEXT,
  ADD COLUMN "ingestionSuspendedAt" TIMESTAMP(3),
  ADD COLUMN "ingestionSuspendReason" TEXT,
  ADD COLUMN "inferenceSuspendedAt" TIMESTAMP(3),
  ADD COLUMN "inferenceSuspendReason" TEXT;

ALTER TABLE "AnalysisRun"
  ADD COLUMN "processingMode" TEXT NOT NULL DEFAULT 'INFERENCE_ENABLED',
  ADD COLUMN "inferenceStatus" TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "admissionManifest" JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN "admissionDigest" TEXT;

ALTER TABLE "Source"
  ADD COLUMN "quarantineStatus" TEXT NOT NULL DEFAULT 'CLEAR',
  ADD COLUMN "quarantineReason" TEXT,
  ADD COLUMN "scannerVersion" TEXT;

CREATE TABLE "SecretOverride" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "authorizedBy" TEXT NOT NULL,
  "authorizedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "scannerVersion" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SecretOverride_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SecretOverride_projectId_contentHash_key" ON "SecretOverride"("projectId", "contentHash");
CREATE INDEX "SecretOverride_projectId_createdAt_idx" ON "SecretOverride"("projectId", "createdAt");

ALTER TABLE "SecretOverride" ADD CONSTRAINT "SecretOverride_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
