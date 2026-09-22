CREATE TABLE "SandboxKey" (
  "id" TEXT NOT NULL,
  "keyId" TEXT NOT NULL,
  "keyMaterial" TEXT,
  "retiredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SandboxKey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SandboxKey_keyId_key" ON "SandboxKey"("keyId");

CREATE TABLE "VerificationRequest" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "files" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "checkProfile" TEXT NOT NULL DEFAULT 'default',
  "patchHash" TEXT,
  "manifestHash" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PROPOSED',
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VerificationRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VerificationRequest_projectId_status_idx" ON "VerificationRequest"("projectId", "status");
ALTER TABLE "VerificationRequest" ADD CONSTRAINT "VerificationRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "VerificationResult" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "envelopeId" TEXT NOT NULL,
  "checkId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "exitCode" INTEGER,
  "outputDigest" TEXT,
  "keyId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VerificationResult_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VerificationResult_envelopeId_key" ON "VerificationResult"("envelopeId");
CREATE INDEX "VerificationResult_requestId_createdAt_idx" ON "VerificationResult"("requestId", "createdAt");
