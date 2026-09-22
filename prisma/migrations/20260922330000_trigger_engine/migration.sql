CREATE TABLE "TriggerSettings" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "debounceMinutes" INTEGER NOT NULL DEFAULT 5,
  "quietStartHour" INTEGER,
  "quietEndHour" INTEGER,
  "materialityThreshold" INTEGER NOT NULL DEFAULT 1,
  "digestEnabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TriggerSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TriggerSettings_projectId_key" ON "TriggerSettings"("projectId");
ALTER TABLE "TriggerSettings" ADD CONSTRAINT "TriggerSettings_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Project" ADD COLUMN "lastWebhookDeliveryAt" TIMESTAMP(3);
