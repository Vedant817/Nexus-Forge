CREATE TABLE "PullRequestSnapshot" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "analysisRunId" TEXT NOT NULL,
  "repositoryFullName" TEXT NOT NULL,
  "pullNumber" INTEGER NOT NULL,
  "headSha" TEXT NOT NULL,
  "baseSha" TEXT NOT NULL,
  "mergedCommitSha" TEXT,
  "fileCount" INTEGER NOT NULL DEFAULT 0,
  "checkCount" INTEGER NOT NULL DEFAULT 0,
  "reviewCount" INTEGER NOT NULL DEFAULT 0,
  "collectorVersion" TEXT NOT NULL,
  "complete" BOOLEAN NOT NULL DEFAULT false,
  "diagnostics" JSONB NOT NULL,
  "observedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PullRequestSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PullRequestSnapshot_analysisRunId_key" ON "PullRequestSnapshot"("analysisRunId");
CREATE INDEX "PullRequestSnapshot_projectId_createdAt_idx" ON "PullRequestSnapshot"("projectId", "createdAt");
ALTER TABLE "PullRequestSnapshot" ADD CONSTRAINT "PullRequestSnapshot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PullRequestSnapshot" ADD CONSTRAINT "PullRequestSnapshot_analysisRunId_fkey" FOREIGN KEY ("analysisRunId") REFERENCES "AnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PullRequestFile" (
  "id" TEXT NOT NULL,
  "snapshotId" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "additions" INTEGER NOT NULL DEFAULT 0,
  "deletions" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'collected',
  CONSTRAINT "PullRequestFile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PullRequestFile_snapshotId_path_key" ON "PullRequestFile"("snapshotId", "path");
CREATE INDEX "PullRequestFile_snapshotId_idx" ON "PullRequestFile"("snapshotId");
ALTER TABLE "PullRequestFile" ADD CONSTRAINT "PullRequestFile_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "PullRequestSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PullRequestCheck" (
  "id" TEXT NOT NULL,
  "snapshotId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "conclusion" TEXT,
  CONSTRAINT "PullRequestCheck_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PullRequestCheck_snapshotId_idx" ON "PullRequestCheck"("snapshotId");
ALTER TABLE "PullRequestCheck" ADD CONSTRAINT "PullRequestCheck_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "PullRequestSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PullRequestReview" (
  "id" TEXT NOT NULL,
  "snapshotId" TEXT NOT NULL,
  "reviewId" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "submittedAt" TEXT,
  CONSTRAINT "PullRequestReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PullRequestReview_snapshotId_reviewId_key" ON "PullRequestReview"("snapshotId", "reviewId");
CREATE INDEX "PullRequestReview_snapshotId_idx" ON "PullRequestReview"("snapshotId");
ALTER TABLE "PullRequestReview" ADD CONSTRAINT "PullRequestReview_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "PullRequestSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
