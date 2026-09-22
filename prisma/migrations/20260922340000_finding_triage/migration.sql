CREATE TABLE "Finding" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "criterionId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "ownerId" TEXT,
  "dueAt" TIMESTAMP(3),
  "evidenceIds" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "externalIssue" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Finding_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Finding_projectId_criterionId_key" ON "Finding"("projectId", "criterionId");
CREATE INDEX "Finding_projectId_status_idx" ON "Finding"("projectId", "status");
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "FindingComment" (
  "id" TEXT NOT NULL,
  "findingId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FindingComment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FindingComment_findingId_createdAt_idx" ON "FindingComment"("findingId", "createdAt");
ALTER TABLE "FindingComment" ADD CONSTRAINT "FindingComment_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "Finding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "FindingWaiver" (
  "id" TEXT NOT NULL,
  "findingId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "approverId" TEXT NOT NULL,
  "scope" TEXT NOT NULL DEFAULT 'criterion',
  "expiresAt" TIMESTAMP(3),
  "reopenOnCommit" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FindingWaiver_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FindingWaiver_findingId_createdAt_idx" ON "FindingWaiver"("findingId", "createdAt");
ALTER TABLE "FindingWaiver" ADD CONSTRAINT "FindingWaiver_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "Finding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "FindingResolution" (
  "id" TEXT NOT NULL,
  "findingId" TEXT NOT NULL,
  "commitSha" TEXT NOT NULL,
  "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "verifierId" TEXT NOT NULL,
  CONSTRAINT "FindingResolution_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FindingResolution_findingId_verifiedAt_idx" ON "FindingResolution"("findingId", "verifiedAt");
ALTER TABLE "FindingResolution" ADD CONSTRAINT "FindingResolution_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "Finding"("id") ON DELETE CASCADE ON UPDATE CASCADE;
