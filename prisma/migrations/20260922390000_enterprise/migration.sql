CREATE TABLE "VerifiedDomain" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "domain" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "verifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VerifiedDomain_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VerifiedDomain_organizationId_domain_key" ON "VerifiedDomain"("organizationId", "domain");
ALTER TABLE "VerifiedDomain" ADD CONSTRAINT "VerifiedDomain_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CustomRole" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "permissions" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomRole_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomRole_organizationId_name_key" ON "CustomRole"("organizationId", "name");
ALTER TABLE "CustomRole" ADD CONSTRAINT "CustomRole_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SeparationOfDuty" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "actionA" TEXT NOT NULL,
  "actionB" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SeparationOfDuty_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SeparationOfDuty_organizationId_actionA_actionB_key" ON "SeparationOfDuty"("organizationId", "actionA", "actionB");
ALTER TABLE "SeparationOfDuty" ADD CONSTRAINT "SeparationOfDuty_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "GroupMapping" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "idpGroup" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GroupMapping_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GroupMapping_organizationId_idpGroup_key" ON "GroupMapping"("organizationId", "idpGroup");
ALTER TABLE "GroupMapping" ADD CONSTRAINT "GroupMapping_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "RetentionPolicy" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "auditDays" INTEGER NOT NULL DEFAULT 365,
  "evidenceDays" INTEGER NOT NULL DEFAULT 365,
  "backupDays" INTEGER NOT NULL DEFAULT 14,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RetentionPolicy_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RetentionPolicy_organizationId_key" ON "RetentionPolicy"("organizationId");
ALTER TABLE "RetentionPolicy" ADD CONSTRAINT "RetentionPolicy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CustomerManagedKey" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "keyRef" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerManagedKey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomerManagedKey_organizationId_key" ON "CustomerManagedKey"("organizationId");
ALTER TABLE "CustomerManagedKey" ADD CONSTRAINT "CustomerManagedKey_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SupportAccessGrant" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "grantedBy" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportAccessGrant_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SupportAccessGrant_organizationId_createdAt_idx" ON "SupportAccessGrant"("organizationId", "createdAt");
ALTER TABLE "SupportAccessGrant" ADD CONSTRAINT "SupportAccessGrant_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
