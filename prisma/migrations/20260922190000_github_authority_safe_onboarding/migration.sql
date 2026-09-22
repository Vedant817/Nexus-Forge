ALTER TABLE "Project"
  ADD COLUMN "githubInstallationAccountId" TEXT,
  ADD COLUMN "githubInstallationAccountLogin" TEXT,
  ADD COLUMN "githubInstallationAccountType" TEXT,
  ADD COLUMN "githubInstallationRepositorySelection" TEXT,
  ADD COLUMN "githubInstallationPermissions" JSONB,
  ADD COLUMN "githubAuthorizedByGithubUserId" TEXT,
  ADD COLUMN "githubAuthorizedByUserId" TEXT,
  ADD COLUMN "githubBindingLastReconciledAt" TIMESTAMP(3),
  ADD COLUMN "githubBindingReconciliationError" TEXT;

-- Bindings created by the legacy client-supplied flow require authoritative re-onboarding.
UPDATE "Project"
SET "githubBindingStatus" = 'reconciliation_required',
    "githubBindingDisabledAt" = CURRENT_TIMESTAMP,
    "githubBindingReconciliationError" = 'REAUTHORIZATION_REQUIRED'
WHERE "githubBindingStatus" = 'active';

CREATE TABLE "GitHubOnboardingState" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "installationId" TEXT,
  "installationAccountId" TEXT,
  "installationAccountLogin" TEXT,
  "installationAccountType" TEXT,
  "repositorySelection" TEXT,
  "installationPermissions" JSONB,
  "githubUserId" TEXT,
  "callbackVerifiedAt" TIMESTAMP(3),
  "consumedAt" TIMESTAMP(3),
  "failureCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GitHubOnboardingState_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GitHubOnboardingState_status_check" CHECK ("status" IN ('PENDING','CALLBACK_VERIFIED','CONSUMED','FAILED'))
);

CREATE TABLE "RepositoryPermissionSnapshot" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "installationId" TEXT NOT NULL,
  "repositoryId" TEXT NOT NULL,
  "repositoryFullName" TEXT NOT NULL,
  "installationPermissions" JSONB NOT NULL,
  "userRepositoryPermissions" JSONB NOT NULL,
  "repositorySelection" TEXT NOT NULL,
  "observedAt" TIMESTAMP(3) NOT NULL,
  "source" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RepositoryPermissionSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GitHubInstallationLifecycle" (
  "installationId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "deliveryId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "observedAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GitHubInstallationLifecycle_pkey" PRIMARY KEY ("installationId")
);

CREATE UNIQUE INDEX "GitHubOnboardingState_tokenHash_key" ON "GitHubOnboardingState"("tokenHash");
CREATE INDEX "GitHubOnboardingState_projectId_status_expiresAt_idx" ON "GitHubOnboardingState"("projectId", "status", "expiresAt");
CREATE INDEX "GitHubOnboardingState_userId_sessionId_status_idx" ON "GitHubOnboardingState"("userId", "sessionId", "status");
CREATE INDEX "RepositoryPermissionSnapshot_projectId_observedAt_idx" ON "RepositoryPermissionSnapshot"("projectId", "observedAt");
CREATE INDEX "RepositoryPermissionSnapshot_installationId_repositoryId_observedAt_idx" ON "RepositoryPermissionSnapshot"("installationId", "repositoryId", "observedAt");

ALTER TABLE "GitHubOnboardingState" ADD CONSTRAINT "GitHubOnboardingState_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GitHubOnboardingState" ADD CONSTRAINT "GitHubOnboardingState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GitHubOnboardingState" ADD CONSTRAINT "GitHubOnboardingState_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RepositoryPermissionSnapshot" ADD CONSTRAINT "RepositoryPermissionSnapshot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
