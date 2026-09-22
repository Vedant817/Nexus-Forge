CREATE TABLE "AcceptedBaseline" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AcceptedBaseline_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AcceptedBaseline_runId_key" ON "AcceptedBaseline"("runId");
CREATE INDEX "AcceptedBaseline_projectId_createdAt_idx" ON "AcceptedBaseline"("projectId", "createdAt");
ALTER TABLE "AcceptedBaseline" ADD CONSTRAINT "AcceptedBaseline_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AcceptedBaseline" ADD CONSTRAINT "AcceptedBaseline_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PilotSchedule" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "cadence" TEXT NOT NULL DEFAULT 'WEEKLY',
  "nextRunAt" TIMESTAMP(3) NOT NULL,
  "lastRunAt" TIMESTAMP(3),
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PilotSchedule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PilotSchedule_projectId_key" ON "PilotSchedule"("projectId");
ALTER TABLE "PilotSchedule" ADD CONSTRAINT "PilotSchedule_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "BaselineDigest" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "baselineRunId" TEXT NOT NULL,
  "additions" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "removals" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "statusChanges" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "unknowns" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "deliveredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BaselineDigest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BaselineDigest_projectId_runId_key" ON "BaselineDigest"("projectId", "runId");
CREATE INDEX "BaselineDigest_projectId_createdAt_idx" ON "BaselineDigest"("projectId", "createdAt");
ALTER TABLE "BaselineDigest" ADD CONSTRAINT "BaselineDigest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
