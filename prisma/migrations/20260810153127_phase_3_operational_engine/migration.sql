-- CreateEnum
CREATE TYPE "ClientActionType" AS ENUM ('UPLOAD_DOCUMENT', 'REPLACE_DOCUMENT', 'PROVIDE_INFORMATION', 'CONFIRM_INFORMATION', 'MAKE_PAYMENT', 'APPROVE_DECLARATION', 'SIGN_DECLARATION', 'OTHER');

-- CreateEnum
CREATE TYPE "ClientActionStatus" AS ENUM ('OPEN', 'COMPLETED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SlaEventCategory" AS ENUM ('INTERNAL', 'CLIENT_WAITING', 'GOVERNMENT_WAITING');

-- CreateEnum
CREATE TYPE "SlaEventType" AS ENUM ('STARTED', 'PAUSED', 'RESUMED', 'STATUS_CHANGE', 'EXTENSION', 'DEADLINE_RECALCULATED', 'COMPLETED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "GovernmentStatus" ADD VALUE 'ADDITIONAL_INFORMATION_REQUIRED';
ALTER TYPE "GovernmentStatus" ADD VALUE 'ACKNOWLEDGED';
ALTER TYPE "GovernmentStatus" ADD VALUE 'RESUBMITTED';
ALTER TYPE "GovernmentStatus" ADD VALUE 'UNKNOWN';

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "documentNumber" TEXT,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "isExpired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "issuedAt" TIMESTAMP(3),
ADD COLUMN     "issuingAuthority" TEXT;

-- AlterTable
ALTER TABLE "government_applications" ADD COLUMN     "additionalInformationDeadline" TIMESTAMP(3),
ADD COLUMN     "additionalInformationRequestedAt" TIMESTAMP(3),
ADD COLUMN     "additionalInformationRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "expectedCompletionAt" TIMESTAMP(3),
ADD COLUMN     "rejectedAt" TIMESTAMP(3),
ADD COLUMN     "trackingNumber" TEXT;

-- AlterTable
ALTER TABLE "government_status_histories" ADD COLUMN     "externalReference" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'ADMIN';

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "templateKey" TEXT;

-- AlterTable
ALTER TABLE "services" ADD COLUMN     "defaultGovernmentAgency" TEXT,
ADD COLUMN     "defaultGovernmentPlatform" TEXT,
ADD COLUMN     "expiryValidityMonths" INTEGER,
ADD COLUMN     "pauseSlaOnClientAction" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "pauseSlaOnGovernmentProcessing" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requiresFinalDocument" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "requiresFullPaymentBeforeSubmission" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "requiresGovernmentTrackingNumber" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "government_references" (
    "id" TEXT NOT NULL,
    "governmentApplicationId" TEXT NOT NULL,
    "referenceType" TEXT NOT NULL,
    "referenceValue" TEXT NOT NULL,
    "issuingPlatform" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "government_references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "smsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "inAppEnabled" BOOLEAN NOT NULL DEFAULT true,
    "marketingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_actions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "requirementId" TEXT,
    "type" "ClientActionType" NOT NULL DEFAULT 'PROVIDE_INFORMATION',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priority" "ApplicationPriority" NOT NULL DEFAULT 'NORMAL',
    "dueAt" TIMESTAMP(3),
    "status" "ClientActionStatus" NOT NULL DEFAULT 'OPEN',
    "createdById" TEXT,
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "completionNotes" TEXT,
    "responsePayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_sla_events" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "eventType" "SlaEventType" NOT NULL DEFAULT 'STATUS_CHANGE',
    "category" "SlaEventCategory" NOT NULL DEFAULT 'INTERNAL',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "durationMinutes" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT,
    "actorId" TEXT,
    "actorRole" "UserRole",
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_sla_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "government_references_governmentApplicationId_idx" ON "government_references"("governmentApplicationId");

-- CreateIndex
CREATE INDEX "government_references_referenceValue_idx" ON "government_references"("referenceValue");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_userId_key" ON "notification_preferences"("userId");

-- CreateIndex
CREATE INDEX "client_actions_organizationId_status_idx" ON "client_actions"("organizationId", "status");

-- CreateIndex
CREATE INDEX "client_actions_applicationId_status_idx" ON "client_actions"("applicationId", "status");

-- CreateIndex
CREATE INDEX "client_actions_dueAt_idx" ON "client_actions"("dueAt");

-- CreateIndex
CREATE INDEX "application_sla_events_applicationId_idx" ON "application_sla_events"("applicationId");

-- CreateIndex
CREATE INDEX "application_sla_events_category_idx" ON "application_sla_events"("category");

-- CreateIndex
CREATE INDEX "application_sla_events_createdAt_idx" ON "application_sla_events"("createdAt");

-- CreateIndex
CREATE INDEX "documents_expiresAt_idx" ON "documents"("expiresAt");

-- CreateIndex
CREATE INDEX "government_applications_trackingNumber_idx" ON "government_applications"("trackingNumber");

-- AddForeignKey
ALTER TABLE "government_references" ADD CONSTRAINT "government_references_governmentApplicationId_fkey" FOREIGN KEY ("governmentApplicationId") REFERENCES "government_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_actions" ADD CONSTRAINT "client_actions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_actions" ADD CONSTRAINT "client_actions_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_actions" ADD CONSTRAINT "client_actions_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "application_requirements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_actions" ADD CONSTRAINT "client_actions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_actions" ADD CONSTRAINT "client_actions_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_sla_events" ADD CONSTRAINT "application_sla_events_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
