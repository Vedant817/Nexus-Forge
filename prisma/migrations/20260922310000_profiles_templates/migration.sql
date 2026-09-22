CREATE TABLE "ProfileRevision" (
  "id" TEXT NOT NULL,
  "projectId" TEXT,
  "name" TEXT NOT NULL,
  "preset" TEXT NOT NULL,
  "controls" JSONB NOT NULL,
  "version" INTEGER NOT NULL,
  "actorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProfileRevision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProfileRevision_projectId_version_key" ON "ProfileRevision"("projectId", "version");
CREATE INDEX "ProfileRevision_projectId_createdAt_idx" ON "ProfileRevision"("projectId", "createdAt");
ALTER TABLE "ProfileRevision" ADD CONSTRAINT "ProfileRevision_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "RunTemplate" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "controls" JSONB NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RunTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RunTemplate_name_key" ON "RunTemplate"("name");
