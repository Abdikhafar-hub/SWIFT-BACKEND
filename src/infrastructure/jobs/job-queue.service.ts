import { prisma } from "../database/prisma.js";
import { JobStatus } from "@prisma/client";
import { runSlaMonitorJob } from "./sla-monitor.job.js";
import { runGovernmentMonitorJob } from "./government-monitor.job.js";
import { runClientActionReminderJob } from "./client-action-reminder.job.js";
import { runDocumentExpiryJob } from "./document-expiry.job.js";
import { runPaymentReminderJob } from "./payment-reminder.job.js";
import { runOverdueInvoiceJob } from "./overdue-invoice.job.js";
import { runReconciliationSweepJob } from "./reconciliation-sweep.job.js";

export type JobHandler = (payload: any) => Promise<any>;

export class JobQueueService {
  private workers: Map<string, JobHandler> = new Map();
  private intervalId: NodeJS.Timeout | null = null;
  private isProcessing = false;

  constructor() {
    // Register standard background job handlers
    this.registerWorker("SLA_SWEEP", async (payload) => {
      return runSlaMonitorJob(payload);
    });

    this.registerWorker("GOVERNMENT_MONITOR", async (payload) => {
      return runGovernmentMonitorJob(payload);
    });

    this.registerWorker("CLIENT_ACTION_REMINDER", async (payload) => {
      return runClientActionReminderJob(payload);
    });

    this.registerWorker("DOCUMENT_EXPIRY_CHECK", async (payload) => {
      return runDocumentExpiryJob(payload);
    });

    this.registerWorker("PAYMENT_REMINDER", async (payload) => {
      return runPaymentReminderJob(payload);
    });

    this.registerWorker("OVERDUE_INVOICE_SWEEP", async (payload) => {
      return runOverdueInvoiceJob(payload);
    });

    this.registerWorker("RECONCILIATION_SWEEP", async (payload) => {
      return runReconciliationSweepJob(payload);
    });
  }

  /**
   * Register a worker function for a specific job type
   */
  registerWorker(jobType: string, handler: JobHandler) {
    this.workers.set(jobType, handler);
  }

  /**
   * Enqueue a job to the background queue with deduplication support
   */
  async enqueue(
    jobType: string,
    payload: any,
    options?: {
      organizationId?: string;
      deduplicationKey?: string;
      delayMs?: number;
      maxAttempts?: number;
      queueName?: string;
    }
  ) {
    if (options?.deduplicationKey) {
      const existing = await prisma.backgroundJob.findFirst({
        where: {
          deduplicationKey: options.deduplicationKey,
          status: { in: [JobStatus.PENDING, JobStatus.PROCESSING] },
        },
      });
      if (existing) return existing;
    }

    const scheduledAt = options?.delayMs
      ? new Date(Date.now() + options.delayMs)
      : new Date();

    return prisma.backgroundJob.create({
      data: {
        organizationId: options?.organizationId,
        queueName: options?.queueName || "default",
        jobType,
        deduplicationKey: options?.deduplicationKey || null,
        payload: payload || {},
        status: JobStatus.PENDING,
        maxAttempts: options?.maxAttempts || 3,
        scheduledAt,
      },
    });
  }

  /**
   * Process all pending background jobs that are ready to run
   */
  async processPendingJobs() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const now = new Date();
      const pendingJobs = await prisma.backgroundJob.findMany({
        where: {
          status: JobStatus.PENDING,
          scheduledAt: { lte: now },
        },
        take: 10,
        orderBy: { createdAt: "asc" },
      });

      for (const job of pendingJobs) {
        const handler = this.workers.get(job.jobType);
        if (!handler) {
          await prisma.backgroundJob.update({
            where: { id: job.id },
            data: {
              status: JobStatus.FAILED,
              lastError: `No worker registered for job type: ${job.jobType}`,
              processedAt: new Date(),
            },
          });
          continue;
        }

        // Mark processing
        await prisma.backgroundJob.update({
          where: { id: job.id },
          data: {
            status: JobStatus.PROCESSING,
            attempts: job.attempts + 1,
          },
        });

        try {
          await handler(job.payload);

          // Mark completed
          await prisma.backgroundJob.update({
            where: { id: job.id },
            data: {
              status: JobStatus.COMPLETED,
              processedAt: new Date(),
            },
          });
        } catch (error: any) {
          const isMaxAttempts = job.attempts + 1 >= job.maxAttempts;
          await prisma.backgroundJob.update({
            where: { id: job.id },
            data: {
              status: isMaxAttempts ? JobStatus.FAILED : JobStatus.PENDING,
              lastError: error.message || String(error),
              scheduledAt: isMaxAttempts
                ? job.scheduledAt
                : new Date(Date.now() + 60 * 1000 * Math.pow(2, job.attempts)), // exponential backoff
            },
          });
        }
      }
    } catch (err) {
      console.error("[JobQueue] Error during job processing sweep:", err);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Run all periodic background routines in sequence
   */
  async runAllScheduledSweeps(organizationId?: string) {
    const results = {
      sla: await runSlaMonitorJob({ organizationId }),
      government: await runGovernmentMonitorJob({ organizationId }),
      clientActions: await runClientActionReminderJob({ organizationId }),
      documentExpiry: await runDocumentExpiryJob({ organizationId }),
      paymentReminder: await runPaymentReminderJob({ organizationId }),
      timestamp: new Date(),
    };
    return results;
  }

  /**
   * Start scheduled background worker
   */
  start(intervalMs: number = 60000) {
    if (this.intervalId) return;

    this.intervalId = setInterval(async () => {
      try {
        await this.runAllScheduledSweeps();
      } catch (e) {
        console.error("[JobQueue] Periodic sweep error:", e);
      }

      await this.processPendingJobs();
    }, intervalMs);

    if (this.intervalId.unref) {
      this.intervalId.unref();
    }
  }

  /**
   * Stop scheduled worker
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}

export const jobQueueService = new JobQueueService();
