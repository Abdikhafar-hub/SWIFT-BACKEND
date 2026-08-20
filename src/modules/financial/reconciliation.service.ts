import { prisma } from "../../infrastructure/database/prisma.js";
import { Prisma, ReconciliationStatus, PaymentStatus, TransactionType, UserRole } from "@prisma/client";
import { NotFoundError, BadRequestError } from "../../common/errors/app-error.js";
import { toDecimal } from "../../common/utils/money.js";
import { recordAuditLog } from "../../common/utils/audit.js";

export class ReconciliationService {
  /**
   * List reconciliation records with filters and pagination
   */
  async listReconciliationRecords(
    organizationId: string,
    params: {
      page?: number;
      limit?: number;
      status?: ReconciliationStatus;
      provider?: string;
      search?: string;
      fromDate?: string;
      toDate?: string;
    }
  ) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.ReconciliationRecordWhereInput = {
      organizationId,
    };

    if (params.status) where.status = params.status;
    if (params.provider) where.provider = params.provider;

    if (params.search) {
      where.OR = [
        { reference: { contains: params.search, mode: "insensitive" } },
        { notes: { contains: params.search, mode: "insensitive" } },
      ];
    }

    if (params.fromDate || params.toDate) {
      where.createdAt = {};
      if (params.fromDate) where.createdAt.gte = new Date(params.fromDate);
      if (params.toDate) where.createdAt.lte = new Date(params.toDate);
    }

    const [records, total] = await Promise.all([
      prisma.reconciliationRecord.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          transaction: {
            select: {
              id: true,
              transactionNumber: true,
              paymentMethod: true,
              amount: true,
              status: true,
              paidAt: true,
              payment: {
                select: {
                  id: true,
                  invoiceNumber: true,
                  application: {
                    select: {
                      id: true,
                      applicationNumber: true,
                      service: {
                        select: { name: true },
                      },
                    },
                  },
                },
              },
            },
          },
          reconciledBy: {
            select: { id: true, email: true },
          },
        },
      }),
      prisma.reconciliationRecord.count({ where }),
    ]);

    return {
      data: records,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get single reconciliation record
   */
  async getReconciliationRecordById(id: string, organizationId: string) {
    const record = await prisma.reconciliationRecord.findFirst({
      where: { id, organizationId },
      include: {
        transaction: {
          include: {
            payment: {
              include: {
                client: true,
                application: true,
              },
            },
            receipt: true,
          },
        },
        reconciledBy: {
          select: { id: true, email: true },
        },
      },
    });

    if (!record) {
      throw new NotFoundError("Reconciliation record not found");
    }

    return record;
  }

  /**
   * Ingest external statement/transaction entry for reconciliation
   */
  async recordStatementEntry(
    data: {
      reference: string;
      amount: number | Prisma.Decimal;
      provider?: string;
      notes?: string;
      metadata?: any;
    },
    organizationId: string
  ) {
    const amount = toDecimal(data.amount);
    const provider = data.provider || "MPESA";

    // Check if record already exists for this reference
    const existing = await prisma.reconciliationRecord.findFirst({
      where: {
        organizationId,
        reference: data.reference,
      },
    });

    if (existing) {
      return existing;
    }

    // Attempt instant match with internal transactions
    const matchingTx = await prisma.paymentTransaction.findFirst({
      where: {
        organizationId,
        OR: [
          { externalReference: data.reference },
          { providerReference: data.reference },
        ],
      },
    });

    let status: ReconciliationStatus = ReconciliationStatus.UNMATCHED;
    let transactionId: string | null = null;
    let notes = data.notes || null;

    if (matchingTx) {
      transactionId = matchingTx.id;
      if (matchingTx.transactionType === TransactionType.REVERSAL) {
        status = ReconciliationStatus.REVERSED;
        notes = "Matched with reversed transaction";
      } else if (matchingTx.amount.equals(amount)) {
        status = ReconciliationStatus.MATCHED;
        notes = "Auto-matched during statement ingestion";
      } else {
        status = ReconciliationStatus.SUSPICIOUS;
        notes = `Amount mismatch: statement KES ${amount.toString()} vs internal KES ${matchingTx.amount.toString()}`;
      }
    }

    const record = await prisma.reconciliationRecord.create({
      data: {
        organizationId,
        reference: data.reference,
        transactionId,
        amount,
        currency: "KES",
        provider,
        status,
        reconciledAt: status === ReconciliationStatus.MATCHED ? new Date() : null,
        notes,
        metadata: data.metadata || Prisma.DbNull,
      },
    });

    return record;
  }

  /**
   * Run automated reconciliation matching engine across all records
   */
  async runReconciliationMatching(organizationId: string, userId?: string) {
    const unmatched = await prisma.reconciliationRecord.findMany({
      where: {
        organizationId,
        status: { in: [ReconciliationStatus.UNMATCHED, ReconciliationStatus.SUSPICIOUS] },
      },
    });

    let matchedCount = 0;
    let suspiciousCount = 0;
    let duplicateCount = 0;
    let unchangedCount = 0;

    for (const record of unmatched) {
      // Find candidate transactions
      const transactions = await prisma.paymentTransaction.findMany({
        where: {
          organizationId,
          OR: [
            { externalReference: record.reference },
            { providerReference: record.reference },
          ],
        },
      });

      if (transactions.length === 0) {
        unchangedCount++;
        continue;
      }

      if (transactions.length > 1) {
        // Multiple matches detected
        await prisma.reconciliationRecord.update({
          where: { id: record.id },
          data: {
            status: ReconciliationStatus.DUPLICATE,
            notes: `Duplicate match: found ${transactions.length} internal transactions with reference ${record.reference}`,
          },
        });
        duplicateCount++;
        continue;
      }

      const tx = transactions[0];

      if (tx.transactionType === TransactionType.REVERSAL) {
        await prisma.reconciliationRecord.update({
          where: { id: record.id },
          data: {
            transactionId: tx.id,
            status: ReconciliationStatus.REVERSED,
            notes: "Linked to reversed transaction",
            reconciledAt: new Date(),
            reconciledById: userId || null,
          },
        });
        matchedCount++;
      } else if (tx.amount.equals(record.amount)) {
        await prisma.reconciliationRecord.update({
          where: { id: record.id },
          data: {
            transactionId: tx.id,
            status: ReconciliationStatus.MATCHED,
            notes: "Successfully matched by reconciliation engine",
            reconciledAt: new Date(),
            reconciledById: userId || null,
          },
        });
        matchedCount++;
      } else {
        await prisma.reconciliationRecord.update({
          where: { id: record.id },
          data: {
            transactionId: tx.id,
            status: ReconciliationStatus.SUSPICIOUS,
            notes: `Amount mismatch: statement KES ${record.amount.toString()} vs internal KES ${tx.amount.toString()}`,
          },
        });
        suspiciousCount++;
      }
    }

    if (userId) {
      await recordAuditLog({
        organizationId,
        actorId: userId,
        actorRole: UserRole.ADMIN,
        action: "RUN_RECONCILIATION",
        resource: "Reconciliation",
        metadata: {
          scanned: unmatched.length,
          matched: matchedCount,
          suspicious: suspiciousCount,
          duplicates: duplicateCount,
          unchanged: unchangedCount,
        },
      });
    }

    return {
      scanned: unmatched.length,
      matched: matchedCount,
      suspicious: suspiciousCount,
      duplicates: duplicateCount,
      unchanged: unchangedCount,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Manually resolve / link a reconciliation record to an internal transaction
   */
  async manualResolveMatch(
    recordId: string,
    organizationId: string,
    transactionId: string,
    notes: string,
    userId: string
  ) {
    const record = await prisma.reconciliationRecord.findFirst({
      where: { id: recordId, organizationId },
    });

    if (!record) {
      throw new NotFoundError("Reconciliation record not found");
    }

    const transaction = await prisma.paymentTransaction.findFirst({
      where: { id: transactionId, organizationId },
    });

    if (!transaction) {
      throw new NotFoundError("Internal transaction not found");
    }

    const updated = await prisma.reconciliationRecord.update({
      where: { id: recordId },
      data: {
        transactionId: transaction.id,
        status: ReconciliationStatus.MATCHED,
        notes: `Manual resolution: ${notes}`,
        reconciledAt: new Date(),
        reconciledById: userId,
      },
    });

    await recordAuditLog({
      organizationId,
      actorId: userId,
      actorRole: UserRole.ADMIN,
      action: "MANUAL_RECONCILIATION_MATCH",
      resource: "ReconciliationRecord",
      resourceId: recordId,
      metadata: {
        reference: record.reference,
        transactionId,
        notes,
      },
    });

    return updated;
  }
}

export const reconciliationService = new ReconciliationService();
