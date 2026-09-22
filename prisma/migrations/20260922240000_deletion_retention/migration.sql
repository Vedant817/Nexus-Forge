CREATE TABLE "TenantKey" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "keyId" TEXT NOT NULL,
  "keyMaterial" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "destroyedAt" TIMESTAMP(3),
  CONSTRAINT "TenantKey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TenantKey_organizationId_key" ON "TenantKey"("organizationId");
CREATE UNIQUE INDEX "TenantKey_keyId_key" ON "TenantKey"("keyId");
ALTER TABLE "TenantKey" ADD CONSTRAINT "TenantKey_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "DeletionRequest" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT,
  "projectId" TEXT,
  "scope" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "requestedBy" TEXT NOT NULL,
  "reason" TEXT,
  "tombstone" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "DeletionRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DeletionRequest_organizationId_status_idx" ON "DeletionRequest"("organizationId", "status");
CREATE INDEX "DeletionRequest_projectId_status_idx" ON "DeletionRequest"("projectId", "status");
ALTER TABLE "DeletionRequest" ADD CONSTRAINT "DeletionRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
