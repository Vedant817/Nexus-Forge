CREATE TABLE "PolicyPack" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "thresholds" JSONB NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PolicyPack_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PolicyPack_organizationId_name_version_key" ON "PolicyPack"("organizationId", "name", "version");
CREATE INDEX "PolicyPack_organizationId_active_idx" ON "PolicyPack"("organizationId", "active");
ALTER TABLE "PolicyPack" ADD CONSTRAINT "PolicyPack_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "RepositoryGroup" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "pattern" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RepositoryGroup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RepositoryGroup_organizationId_name_key" ON "RepositoryGroup"("organizationId", "name");
ALTER TABLE "RepositoryGroup" ADD CONSTRAINT "RepositoryGroup_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ServiceAccount" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT,
  "userId" TEXT,
  "name" TEXT NOT NULL,
  "scopes" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "tokenHash" TEXT NOT NULL,
  "lastRotatedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServiceAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ServiceAccount_tokenHash_key" ON "ServiceAccount"("tokenHash");
CREATE INDEX "ServiceAccount_organizationId_idx" ON "ServiceAccount"("organizationId");
CREATE INDEX "ServiceAccount_userId_idx" ON "ServiceAccount"("userId");

CREATE TABLE "OutboundWebhook" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT,
  "projectId" TEXT,
  "url" TEXT NOT NULL,
  "secret" TEXT NOT NULL,
  "events" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OutboundWebhook_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OutboundWebhook_projectId_idx" ON "OutboundWebhook"("projectId");

CREATE TABLE "OutboundDelivery" (
  "id" TEXT NOT NULL,
  "webhookId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "event" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OutboundDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OutboundDelivery_eventId_key" ON "OutboundDelivery"("eventId");
CREATE INDEX "OutboundDelivery_webhookId_createdAt_idx" ON "OutboundDelivery"("webhookId", "createdAt");
