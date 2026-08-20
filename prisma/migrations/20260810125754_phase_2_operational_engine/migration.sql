/*
  Warnings:

  - You are about to drop the column `serviceName` on the `government_applications` table. All the data in the column will be lost.
  - The `status` column on the `government_applications` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "RequirementStatus" AS ENUM ('PENDING', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'CORRECTION_REQUIRED');

-- CreateEnum
CREATE TYPE "GovernmentStatus" AS ENUM ('NOT_STARTED', 'PREPARING', 'READY_TO_SUBMIT', 'SUBMITTED', 'UNDER_PROCESSING', 'ACTION_REQUIRED', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeliveryMethod" AS ENUM ('DIGITAL', 'PHYSICAL', 'BOTH');

-- CreateEnum
CREATE TYPE "QCResult" AS ENUM ('PASSED', 'FAILED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "application_requirements" ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "reviewNotes" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT,
ADD COLUMN     "status" "RequirementStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "submittedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "applications" ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "pausedAt" TIMESTAMP(3),
ADD COLUMN     "totalPausedDuration" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "government_applications" DROP COLUMN "serviceName",
ADD COLUMN     "approvalDate" TIMESTAMP(3),
ADD COLUMN     "completionDate" TIMESTAMP(3),
ADD COLUMN     "evidenceDocumentUrl" TEXT,
ADD COLUMN     "governmentAgency" TEXT NOT NULL DEFAULT 'eCitizen',
ADD COLUMN     "governmentService" TEXT,
ADD COLUMN     "nextFollowUpDate" TIMESTAMP(3),
ADD COLUMN     "portalUrl" TEXT,
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "statusDescription" TEXT,
ADD COLUMN     "submittedByAdminId" TEXT,
DROP COLUMN "status",
ADD COLUMN     "status" "GovernmentStatus" NOT NULL DEFAULT 'NOT_STARTED';

-- CreateTable
CREATE TABLE "requirement_review_histories" (
    "id" TEXT NOT NULL,
    "applicationRequirementId" TEXT NOT NULL,
    "actorId" TEXT,
    "actorRole" "UserRole",
    "action" TEXT NOT NULL,
    "previousValue" JSONB,
    "newValue" JSONB,
    "status" "RequirementStatus" NOT NULL,
    "reason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "requirement_review_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "government_status_histories" (
    "id" TEXT NOT NULL,
    "governmentApplicationId" TEXT NOT NULL,
    "fromStatus" "GovernmentStatus",
    "toStatus" "GovernmentStatus" NOT NULL,
    "statusDescription" TEXT,
    "notes" TEXT,
    "changedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "government_status_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_messages" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "senderRole" "UserRole" NOT NULL DEFAULT 'CLIENT',
    "visibility" "NoteVisibility" NOT NULL DEFAULT 'CLIENT_VISIBLE',
    "message" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_message_attachments" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_message_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quality_checks" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "result" "QCResult" NOT NULL DEFAULT 'PASSED',
    "checklist" JSONB,
    "notes" TEXT,
    "failedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quality_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_deliveries" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "deliveryMethod" "DeliveryMethod" NOT NULL DEFAULT 'DIGITAL',
    "recipientName" TEXT NOT NULL,
    "recipientPhone" TEXT NOT NULL,
    "recipientEmail" TEXT,
    "physicalAddress" TEXT,
    "dispatchReference" TEXT,
    "trackingNumber" TEXT,
    "carrier" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "deliveredById" TEXT,
    "confirmationStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "proofDocumentUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "application_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "key" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT,
    "responseBody" JSONB,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "background_jobs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "queueName" TEXT NOT NULL DEFAULT 'default',
    "jobType" TEXT NOT NULL,
    "deduplicationKey" TEXT,
    "payload" JSONB NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "lastError" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "background_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "requirement_review_histories_applicationRequirementId_idx" ON "requirement_review_histories"("applicationRequirementId");

-- CreateIndex
CREATE INDEX "requirement_review_histories_createdAt_idx" ON "requirement_review_histories"("createdAt");

-- CreateIndex
CREATE INDEX "government_status_histories_governmentApplicationId_idx" ON "government_status_histories"("governmentApplicationId");

-- CreateIndex
CREATE INDEX "government_status_histories_createdAt_idx" ON "government_status_histories"("createdAt");

-- CreateIndex
CREATE INDEX "application_messages_applicationId_visibility_idx" ON "application_messages"("applicationId", "visibility");

-- CreateIndex
CREATE INDEX "application_messages_organizationId_idx" ON "application_messages"("organizationId");

-- CreateIndex
CREATE INDEX "application_messages_createdAt_idx" ON "application_messages"("createdAt");

-- CreateIndex
CREATE INDEX "application_message_attachments_messageId_idx" ON "application_message_attachments"("messageId");

-- CreateIndex
CREATE INDEX "quality_checks_applicationId_idx" ON "quality_checks"("applicationId");

-- CreateIndex
CREATE INDEX "quality_checks_organizationId_idx" ON "quality_checks"("organizationId");

-- CreateIndex
CREATE INDEX "application_deliveries_applicationId_idx" ON "application_deliveries"("applicationId");

-- CreateIndex
CREATE INDEX "application_deliveries_organizationId_idx" ON "application_deliveries"("organizationId");

-- CreateIndex
CREATE INDEX "application_deliveries_dispatchReference_idx" ON "application_deliveries"("dispatchReference");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_key_key" ON "idempotency_records"("key");

-- CreateIndex
CREATE INDEX "idempotency_records_key_idx" ON "idempotency_records"("key");

-- CreateIndex
CREATE INDEX "idempotency_records_expiresAt_idx" ON "idempotency_records"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "background_jobs_deduplicationKey_key" ON "background_jobs"("deduplicationKey");

-- CreateIndex
CREATE INDEX "background_jobs_status_scheduledAt_idx" ON "background_jobs"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "background_jobs_jobType_idx" ON "background_jobs"("jobType");

-- CreateIndex
CREATE INDEX "background_jobs_deduplicationKey_idx" ON "background_jobs"("deduplicationKey");

-- CreateIndex
CREATE INDEX "application_requirements_applicationId_status_idx" ON "application_requirements"("applicationId", "status");

-- CreateIndex
CREATE INDEX "applications_dueAt_idx" ON "applications"("dueAt");

-- CreateIndex
CREATE INDEX "government_applications_status_idx" ON "government_applications"("status");

-- CreateIndex
CREATE INDEX "government_applications_nextFollowUpDate_idx" ON "government_applications"("nextFollowUpDate");

-- AddForeignKey
ALTER TABLE "application_requirements" ADD CONSTRAINT "application_requirements_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_review_histories" ADD CONSTRAINT "requirement_review_histories_applicationRequirementId_fkey" FOREIGN KEY ("applicationRequirementId") REFERENCES "application_requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "government_applications" ADD CONSTRAINT "government_applications_submittedByAdminId_fkey" FOREIGN KEY ("submittedByAdminId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "government_status_histories" ADD CONSTRAINT "government_status_histories_governmentApplicationId_fkey" FOREIGN KEY ("governmentApplicationId") REFERENCES "government_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_messages" ADD CONSTRAINT "application_messages_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_messages" ADD CONSTRAINT "application_messages_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_messages" ADD CONSTRAINT "application_messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_message_attachments" ADD CONSTRAINT "application_message_attachments_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "application_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_checks" ADD CONSTRAINT "quality_checks_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_checks" ADD CONSTRAINT "quality_checks_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_checks" ADD CONSTRAINT "quality_checks_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_deliveries" ADD CONSTRAINT "application_deliveries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_deliveries" ADD CONSTRAINT "application_deliveries_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_deliveries" ADD CONSTRAINT "application_deliveries_deliveredById_fkey" FOREIGN KEY ("deliveredById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "background_jobs" ADD CONSTRAINT "background_jobs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
