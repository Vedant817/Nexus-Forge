CREATE TABLE "ArtifactReview" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "artifactKind" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "scope" TEXT NOT NULL DEFAULT 'internal',
  "reason" TEXT NOT NULL DEFAULT '',
  "authorId" TEXT NOT NULL,
  "baselineRunId" TEXT,
  "parentId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ArtifactReview_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ArtifactReview_projectId_artifactKind_createdAt_idx" ON "ArtifactReview"("projectId", "artifactKind", "createdAt");
ALTER TABLE "ArtifactReview" ADD CONSTRAINT "ArtifactReview_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
