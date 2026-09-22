CREATE TABLE "PilotEntitlement" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT,
  "userId" TEXT,
  "plan" TEXT NOT NULL DEFAULT 'pilot',
  "maxRunsPerDay" INTEGER NOT NULL DEFAULT 10,
  "maxExportsPerDay" INTEGER NOT NULL DEFAULT 50,
  "maxProjects" INTEGER NOT NULL DEFAULT 50,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "expiresAt" TIMESTAMP(3),
  "suspended" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PilotEntitlement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PilotEntitlement_organizationId_key" ON "PilotEntitlement"("organizationId");
CREATE UNIQUE INDEX "PilotEntitlement_userId_key" ON "PilotEntitlement"("userId");

CREATE TABLE "EntitlementRevision" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT,
  "userId" TEXT,
  "revision" INTEGER NOT NULL,
  "allowances" JSONB NOT NULL,
  "actorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EntitlementRevision_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EntitlementRevision_organizationId_revision_idx" ON "EntitlementRevision"("organizationId", "revision");
CREATE INDEX "EntitlementRevision_userId_revision_idx" ON "EntitlementRevision"("userId", "revision");

CREATE TABLE "EntitlementUsage" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL DEFAULT '',
  "userId" TEXT NOT NULL DEFAULT '',
  "periodStart" TIMESTAMP(3) NOT NULL,
  "runsUsed" INTEGER NOT NULL DEFAULT 0,
  "exportsUsed" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EntitlementUsage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EntitlementUsage_organizationId_userId_periodStart_key" ON "EntitlementUsage"("organizationId", "userId", "periodStart");
CREATE INDEX "EntitlementUsage_periodStart_idx" ON "EntitlementUsage"("periodStart");
