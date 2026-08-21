import { prisma } from "../../infrastructure/database/prisma.js";
import { paymentProvider } from "../../infrastructure/payments/index.js";
import {
  PaymentStatus,
  PaymentMethod,
  UserRole,
  NoteVisibility,
  TransactionType,
  Prisma,
} from "@prisma/client";
import {
  NotFoundError,
  ValidationError,
  ConflictError,
  BadRequestError,
} from "../../common/errors/app-error.js";
import {
  generateTransactionNumber,
  generateReceiptNumber,
} from "../../common/utils/generators.js";
import { toDecimal } from "../../common/utils/money.js";
import { normalizeKenyanPhone } from "../../common/utils/phone.js";
import {
  notificationOrchestrator,
  BaseNotificationContext,
} from "../notifications/notification-orchestrator.service.js";
import { recordAuditLog } from "../../common/utils/audit.js";

export class PaymentService {
  /**
   * Initiate Safaricom Daraja M-Pesa STK Push
   */
  async initiateMpesaStkPush(
    params: {
      applicationId?: string;
      invoiceId?: string;
      phoneNumber: string;
      amount?: number;
      idempotencyKey: string;
    },
    actor: { id: string; email: string; role: UserRole; organizationId: string; clientId?: string | null }
  ) {
    // Normalize and validate Kenyan phone number
    const normalizedPhone = normalizeKenyanPhone(params.phoneNumber);

    // 1. Check idempotency
    const existingTx = await prisma.paymentTransaction.findUnique({
      where: { idempotencyKey: params.idempotencyKey },
    });

    if (existingTx) {
      return {
        transactionId: existingTx.id,
        transactionNumber: existingTx.transactionNumber,
        status: existingTx.status,
        providerReference: existingTx.providerReference,
        isReplay: true,
      };
    }

    // 2. Find payment invoice with strict ownership validation for CLIENT role
    let payment;
    if (params.invoiceId) {
      payment = await prisma.payment.findFirst({
        where: {
          id: params.invoiceId,
          organizationId: actor.organizationId,
          deletedAt: null,
          clientId: actor.role === UserRole.CLIENT ? actor.clientId || "none" : undefined,
        },
        include: {
          client: true,
          application: true,
        },
      });
    } else if (params.applicationId) {
      const app = await prisma.application.findFirst({
        where: {
          id: params.applicationId,
          organizationId: actor.organizationId,
          deletedAt: null,
          clientId: actor.role === UserRole.CLIENT ? actor.clientId || "none" : undefined,
        },
        include: {
          client: true,
          payments: {
            where: { deletedAt: null },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      });

      if (app && app.payments.length > 0) {
        payment = {
          ...app.payments[0],
          client: app.client,
          application: app,
        };
      }
    }

    if (!payment) {
      throw new NotFoundError("Application Payment Record or Invoice not found or access denied.");
    }

    // 3. Strictly derive payable amount server-side from invoice amountDue. NEVER trust client amount.
    const payableAmount = Number(payment.amountDue);
    if (payableAmount <= 0) {
      throw new BadRequestError(`Invoice #${payment.invoiceNumber} is already fully paid.`);
    }

    const transactionNumber = await generateTransactionNumber(actor.organizationId);

    // 4. Call M-Pesa Daraja STK Push Provider
    const stkResponse = await paymentProvider.initiateStkPush({
      phoneNumber: normalizedPhone,
      amount: payableAmount,
      accountReference: payment.application.applicationNumber,
      transactionDesc: `Pay ${payment.invoiceNumber}`,
      idempotencyKey: params.idempotencyKey,
    });

    if (!stkResponse.success) {
      // Record failed transaction attempt
      await prisma.paymentTransaction.create({
        data: {
          paymentId: payment.id,
          organizationId: actor.organizationId,
          clientId: payment.clientId,
          applicationId: payment.applicationId,
          transactionNumber,
          transactionType: TransactionType.PAYMENT,
          paymentMethod: PaymentMethod.MPESA,
          amount: new Prisma.Decimal(payableAmount),
          currency: payment.currency,
          status: PaymentStatus.FAILED,
          idempotencyKey: params.idempotencyKey,
          providerReference: stkResponse.checkoutRequestId || `failed_${Date.now()}`,
          phoneNumber: normalizedPhone,
          providerResponse: stkResponse as any,
        },
      });

      throw new BadRequestError(`M-Pesa STK Push rejected: ${stkResponse.responseDescription}`);
    }

    // 5. Record Processing Transaction in Database
    const transaction = await prisma.paymentTransaction.create({
      data: {
        paymentId: payment.id,
        organizationId: actor.organizationId,
        clientId: payment.clientId,
        applicationId: payment.applicationId,
        transactionNumber,
        transactionType: TransactionType.PAYMENT,
        paymentMethod: PaymentMethod.MPESA,
        amount: new Prisma.Decimal(payableAmount),
        currency: payment.currency,
        status: PaymentStatus.PROCESSING,
        idempotencyKey: params.idempotencyKey,
        providerReference: stkResponse.checkoutRequestId,
        phoneNumber: normalizedPhone,
        providerResponse: stkResponse as any,
      },
    });

    await recordAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorRole: actor.role,
      action: "MPESA_STK_INITIATED",
      resource: "PaymentTransaction",
      resourceId: transaction.id,
      metadata: {
        transactionNumber,
        amount: payableAmount,
        checkoutRequestId: stkResponse.checkoutRequestId,
      },
    });

    return {
      transactionId: transaction.id,
      transactionNumber: transaction.transactionNumber,
      checkoutRequestId: stkResponse.checkoutRequestId,
      responseDescription: stkResponse.responseDescription,
      status: transaction.status,
    };
  }

  /**
   * Actively Query STK Push status from Safaricom Daraja
   */
  async queryStkPushStatus(
    checkoutRequestId: string,
    actor: { id: string; role: UserRole; organizationId: string; clientId?: string | null }
  ) {
    const transaction = await prisma.paymentTransaction.findFirst({
      where: {
        providerReference: checkoutRequestId,
        organizationId: actor.organizationId,
        clientId: actor.role === UserRole.CLIENT ? actor.clientId || "none" : undefined,
      },
      include: {
        payment: true,
      },
    });

    if (!transaction) {
      throw new NotFoundError("Payment transaction not found for CheckoutRequestID");
    }

    if (transaction.status === PaymentStatus.COMPLETED || transaction.status === PaymentStatus.PAID) {
      return {
        transactionId: transaction.id,
        status: transaction.status,
        checkoutRequestId,
        isFinal: true,
        message: "Transaction is already finalized.",
      };
    }

    const queryResult = await paymentProvider.queryTransactionStatus(checkoutRequestId);

    if (queryResult.isSuccess) {
      await this.handleMpesaCallback({
        Body: {
          stkCallback: {
            MerchantRequestID: queryResult.merchantRequestId || transaction.providerReference,
            CheckoutRequestID: checkoutRequestId,
            ResultCode: 0,
            ResultDesc: queryResult.resultDesc,
            CallbackMetadata: {
              Item: [
                { Name: "MpesaReceiptNumber", Value: queryResult.mpesaReceiptNumber },
                { Name: "Amount", Value: queryResult.amount || Number(transaction.amount) },
                { Name: "PhoneNumber", Value: queryResult.phoneNumber || transaction.phoneNumber },
              ],
            },
          },
        },
      });
    } else if (queryResult.resultCode !== 0 && queryResult.resultCode !== 1) {
      await prisma.paymentTransaction.update({
        where: { id: transaction.id },
        data: {
          status: PaymentStatus.FAILED,
          providerResponse: queryResult as any,
        },
      });
    }

    const updatedTx = await prisma.paymentTransaction.findUnique({
      where: { id: transaction.id },
    });

    return {
      transactionId: transaction.id,
      status: updatedTx?.status || transaction.status,
      checkoutRequestId,
      resultCode: queryResult.resultCode,
      resultDesc: queryResult.resultDesc,
    };
  }

  /**
   * Process incoming M-Pesa STK Callback with idempotency and transaction safety
   */
  async handleMpesaCallback(callbackBody: unknown) {
    const parsed = await paymentProvider.processCallback(callbackBody);

    const transaction = await prisma.paymentTransaction.findFirst({
      where: { providerReference: parsed.checkoutRequestId },
      include: {
        payment: true,
        client: { include: { user: true } },
        application: { include: { service: true } },
      },
    });

    if (!transaction) {
      console.warn(`[PaymentService] Callback received for unknown checkoutRequestId: ${parsed.checkoutRequestId}`);
      return { success: false, message: "Transaction not found" };
    }

    if (transaction.status === PaymentStatus.COMPLETED || transaction.status === PaymentStatus.PAID) {
      return { success: true, message: "Transaction already finalized" };
    }

    const txAmount = parsed.amount !== undefined ? new Prisma.Decimal(parsed.amount) : transaction.amount;
    const isSuccess = parsed.isSuccess;

    let updatedPaymentState: any = null;
    let generatedReceipt: any = null;

    const result = await prisma.$transaction(async (tx) => {
      // 1. Update Transaction
      const updatedTx = await tx.paymentTransaction.update({
        where: { id: transaction.id },
        data: {
          status: isSuccess ? PaymentStatus.COMPLETED : PaymentStatus.FAILED,
          externalReference: parsed.mpesaReceiptNumber || null,
          paidAt: isSuccess ? new Date() : null,
          providerResponse: parsed as any,
        },
      });

      if (isSuccess && transaction.payment) {
        // 2. Create Payment Allocation
        await tx.paymentAllocation.create({
          data: {
            transactionId: transaction.id,
            paymentId: transaction.payment.id,
            organizationId: transaction.organizationId,
            amount: txAmount,
            allocatedAt: new Date(),
          },
        });

        // 3. Recalculate Payment totals
        const newPaid = toDecimal(transaction.payment.amountPaid).add(txAmount);
        const newDue = toDecimal(transaction.payment.totalAmount).sub(newPaid);
        const effectiveDue = newDue.lessThan(0) ? new Prisma.Decimal(0) : newDue;
        const newStatus = effectiveDue.isZero() ? PaymentStatus.PAID : PaymentStatus.PARTIALLY_PAID;

        updatedPaymentState = await tx.payment.update({
          where: { id: transaction.payment.id },
          data: {
            amountPaid: newPaid,
            amountDue: effectiveDue,
            status: newStatus,
            paidAt: effectiveDue.isZero() ? new Date() : undefined,
            isOverdue: false,
          },
        });

        // 4. Recalculate Application balance
        if (transaction.applicationId) {
          await tx.application.update({
            where: { id: transaction.applicationId },
            data: {
              paidAmount: newPaid,
              dueAmount: effectiveDue,
            },
          });

          // 5. Activity Log
          await tx.applicationActivity.create({
            data: {
              applicationId: transaction.applicationId,
              action: "PAYMENT_CONFIRMED",
              entityType: "PaymentTransaction",
              entityId: transaction.id,
              message: `M-Pesa payment received: KES ${txAmount.toString()} (Receipt: ${parsed.mpesaReceiptNumber || "N/A"})`,
              visibility: NoteVisibility.CLIENT_VISIBLE,
            },
          });
        }

        // 6. Generate Receipt
        const receiptNumber = await generateReceiptNumber(transaction.organizationId);
        generatedReceipt = await tx.receipt.create({
          data: {
            organizationId: transaction.organizationId,
            clientId: transaction.clientId,
            applicationId: transaction.payment.applicationId,
            paymentId: transaction.paymentId,
            transactionId: transaction.id,
            receiptNumber,
            amount: txAmount,
            currency: transaction.currency,
            paymentMethod: PaymentMethod.MPESA,
            transactionReference: parsed.mpesaReceiptNumber || transaction.transactionNumber,
            payerName: transaction.client.fullName,
            amountPaid: newPaid,
            remainingBalance: effectiveDue,
            issuedAt: new Date(),
            metadata: {
              invoiceNumber: transaction.payment.invoiceNumber,
              checkoutRequestId: parsed.checkoutRequestId,
            },
          },
        });
      }

      await recordAuditLog({
        organizationId: transaction.organizationId,
        action: isSuccess ? "PAYMENT_COMPLETED" : "PAYMENT_FAILED",
        resource: "PaymentTransaction",
        resourceId: transaction.id,
        metadata: {
          receiptNumber: parsed.mpesaReceiptNumber,
          amount: txAmount.toString(),
          resultDesc: parsed.resultDesc,
          generatedReceiptNumber: generatedReceipt?.receiptNumber,
        },
      });

      return updatedTx;
    });

    if (isSuccess && transaction.client && transaction.client.user && transaction.application) {
      const ctx: BaseNotificationContext = {
        organizationId: transaction.organizationId,
        applicationId: transaction.application.id,
        applicationNumber: transaction.application.applicationNumber,
        serviceName: transaction.application.service?.name || "Service",
        clientUserId: transaction.client.user.id,
        clientName: transaction.client.fullName,
        clientEmail: transaction.client.email,
        clientPhone: transaction.client.phone,
      };

      notificationOrchestrator
        .notifyPaymentReceived(ctx, {
          invoiceNumber: transaction.payment?.invoiceNumber || "INV-001",
          amount: txAmount.toString(),
          transactionNumber: parsed.mpesaReceiptNumber || transaction.transactionNumber,
          remainingBalance: updatedPaymentState ? updatedPaymentState.amountDue.toString() : "0.00",
        })
        .catch((err) => console.error("[PaymentService] Failed to notify payment received:", err));
    }

    return {
      success: true,
      transactionId: result.id,
      status: result.status,
      receiptNumber: generatedReceipt?.receiptNumber,
    };
  }

  /**
   * Record a manual payment (Cash, Bank, Cheque, Card)
   */
  async recordManualPayment(
    params: {
      applicationId?: string;
      invoiceId?: string;
      paymentMethod: PaymentMethod;
      amount: number;
      externalReference: string;
      notes?: string;
      idempotencyKey: string;
    },
    adminActor: { id: string; email: string; organizationId: string }
  ) {
    // 1. Check idempotency
    const existingTx = await prisma.paymentTransaction.findUnique({
      where: { idempotencyKey: params.idempotencyKey },
    });

    if (existingTx) {
      throw new ConflictError("A transaction with this idempotency key already exists.");
    }

    let payment;
    if (params.invoiceId) {
      payment = await prisma.payment.findFirst({
        where: { id: params.invoiceId, organizationId: adminActor.organizationId, deletedAt: null },
        include: {
          client: { include: { user: true } },
          application: { include: { service: true } },
        },
      });
    } else if (params.applicationId) {
      const app = await prisma.application.findFirst({
        where: { id: params.applicationId, organizationId: adminActor.organizationId, deletedAt: null },
        include: {
          client: { include: { user: true } },
          service: true,
          payments: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 1 },
        },
      });

      if (app && app.payments.length > 0) {
        payment = {
          ...app.payments[0],
          client: app.client,
          application: app,
        };
      }
    }

    if (!payment) {
      throw new NotFoundError("Application Payment Record or Invoice not found");
    }

    const transactionNumber = await generateTransactionNumber(adminActor.organizationId);
    const txAmount = new Prisma.Decimal(params.amount);

    let updatedPayment: any = null;
    let generatedReceipt: any = null;

    const transaction = await prisma.$transaction(async (tx) => {
      // 1. Create Transaction
      const createdTx = await tx.paymentTransaction.create({
        data: {
          paymentId: payment.id,
          organizationId: adminActor.organizationId,
          clientId: payment.clientId,
          applicationId: payment.applicationId,
          transactionNumber,
          transactionType: TransactionType.PAYMENT,
          paymentMethod: params.paymentMethod,
          amount: txAmount,
          currency: payment.currency,
          status: PaymentStatus.COMPLETED,
          idempotencyKey: params.idempotencyKey,
          externalReference: params.externalReference,
          paidAt: new Date(),
          providerResponse: { recordedBy: adminActor.email, notes: params.notes },
        },
      });

      // 2. Create Payment Allocation
      await tx.paymentAllocation.create({
        data: {
          transactionId: createdTx.id,
          paymentId: payment.id,
          organizationId: adminActor.organizationId,
          amount: txAmount,
          allocatedAt: new Date(),
        },
      });

      // 3. Update Payment Balances
      const newPaid = toDecimal(payment.amountPaid).add(txAmount);
      const newDue = toDecimal(payment.totalAmount).sub(newPaid);
      const effectiveDue = newDue.lessThan(0) ? new Prisma.Decimal(0) : newDue;
      const newStatus = effectiveDue.isZero() ? PaymentStatus.PAID : PaymentStatus.PARTIALLY_PAID;

      updatedPayment = await tx.payment.update({
        where: { id: payment.id },
        data: {
          amountPaid: newPaid,
          amountDue: effectiveDue,
          status: newStatus,
          paidAt: effectiveDue.isZero() ? new Date() : undefined,
          isOverdue: false,
        },
      });

      // 4. Update Application Balances
      if (payment.applicationId) {
        await tx.application.update({
          where: { id: payment.applicationId },
          data: {
            paidAmount: newPaid,
            dueAmount: effectiveDue,
          },
        });

        // 5. Activity
        await tx.applicationActivity.create({
          data: {
            applicationId: payment.applicationId,
            actorId: adminActor.id,
            actorRole: UserRole.ADMIN,
            action: "PAYMENT_CONFIRMED",
            entityType: "PaymentTransaction",
            entityId: createdTx.id,
            message: `Manual ${params.paymentMethod} payment recorded: KES ${txAmount.toString()} (Ref: ${params.externalReference})`,
            visibility: NoteVisibility.CLIENT_VISIBLE,
          },
        });
      }

      // 6. Generate Receipt
      const receiptNumber = await generateReceiptNumber(adminActor.organizationId);
      generatedReceipt = await tx.receipt.create({
        data: {
          organizationId: adminActor.organizationId,
          clientId: payment.clientId,
          applicationId: payment.applicationId,
          paymentId: payment.id,
          transactionId: createdTx.id,
          receiptNumber,
          amount: txAmount,
          currency: payment.currency,
          paymentMethod: params.paymentMethod,
          transactionReference: params.externalReference,
          payerName: payment.client.fullName,
          amountPaid: newPaid,
          remainingBalance: effectiveDue,
          issuedAt: new Date(),
          metadata: {
            invoiceNumber: payment.invoiceNumber,
            notes: params.notes || null,
          },
        },
      });

      // 7. Audit Log
      await recordAuditLog({
        organizationId: adminActor.organizationId,
        actorId: adminActor.id,
        actorRole: UserRole.ADMIN,
        action: "MANUAL_PAYMENT_RECORDED",
        resource: "PaymentTransaction",
        resourceId: createdTx.id,
        metadata: {
          method: params.paymentMethod,
          amount: params.amount,
          externalReference: params.externalReference,
          receiptNumber,
        },
      });

      return createdTx;
    });

    // Notify client
    if (payment.client?.user && payment.application) {
      const ctx: BaseNotificationContext = {
        organizationId: adminActor.organizationId,
        applicationId: payment.application.id,
        applicationNumber: payment.application.applicationNumber,
        serviceName: payment.application.service?.name || "Service",
        clientUserId: payment.client.user.id,
        clientName: payment.client.fullName,
        clientEmail: payment.client.email,
        clientPhone: payment.client.phone,
      };

      notificationOrchestrator
        .notifyPaymentReceived(ctx, {
          invoiceNumber: payment.invoiceNumber,
          amount: txAmount.toString(),
          transactionNumber: params.externalReference || transaction.transactionNumber,
          remainingBalance: updatedPayment ? updatedPayment.amountDue.toString() : "0.00",
        })
        .catch((err) => console.error("[PaymentService] Failed to notify manual payment:", err));
    }

    return {
      ...transaction,
      receipt: generatedReceipt,
    };
  }

  /**
   * Reverse an existing completed payment transaction
   */
  async reversePaymentTransaction(
    transactionId: string,
    organizationId: string,
    reason: string,
    adminActor: { id: string; email: string; organizationId: string }
  ) {
    const originalTx = await prisma.paymentTransaction.findFirst({
      where: { id: transactionId, organizationId },
      include: {
        payment: {
          include: {
            application: true,
            client: true,
          },
        },
        reversals: true,
      },
    });

    if (!originalTx) {
      throw new NotFoundError("Payment transaction not found");
    }

    if (originalTx.status !== PaymentStatus.COMPLETED && originalTx.status !== PaymentStatus.PAID) {
      throw new BadRequestError("Only completed payment transactions can be reversed");
    }

    if (originalTx.transactionType === TransactionType.REVERSAL) {
      throw new BadRequestError("Cannot reverse a reversal transaction");
    }

    if (originalTx.reversals && originalTx.reversals.length > 0) {
      throw new BadRequestError("This transaction has already been reversed");
    }

    const reversalTxNumber = await generateTransactionNumber(organizationId);

    const result = await prisma.$transaction(async (tx) => {
      // 1. Mark original transaction as reversed
      await tx.paymentTransaction.update({
        where: { id: originalTx.id },
        data: {
          reversalReason: reason,
          reversedAt: new Date(),
        },
      });

      // 2. Create Reversal Transaction record
      const reversalTx = await tx.paymentTransaction.create({
        data: {
          paymentId: originalTx.paymentId,
          organizationId,
          clientId: originalTx.clientId,
          applicationId: originalTx.applicationId,
          transactionNumber: reversalTxNumber,
          transactionType: TransactionType.REVERSAL,
          paymentMethod: originalTx.paymentMethod,
          amount: originalTx.amount,
          currency: originalTx.currency,
          status: PaymentStatus.COMPLETED,
          idempotencyKey: `REVERSAL_${originalTx.id}_${Date.now()}`,
          externalReference: `REV-${originalTx.externalReference || originalTx.transactionNumber}`,
          paidAt: new Date(),
          reversalOfId: originalTx.id,
          reversalReason: reason,
          providerResponse: {
            reversedBy: adminActor.email,
            originalTransactionNumber: originalTx.transactionNumber,
            reason,
          },
        },
      });

      // 3. Recalculate Payment totals
      const newPaid = originalTx.payment.amountPaid.sub(originalTx.amount);
      const effectivePaid = newPaid.lessThan(0) ? new Prisma.Decimal(0) : newPaid;
      const newDue = originalTx.payment.totalAmount.sub(effectivePaid);

      let newStatus: PaymentStatus = PaymentStatus.PARTIALLY_PAID;
      if (effectivePaid.isZero()) {
        newStatus = PaymentStatus.ISSUED;
      }

      await tx.payment.update({
        where: { id: originalTx.paymentId },
        data: {
          amountPaid: effectivePaid,
          amountDue: newDue,
          status: newStatus,
        },
      });

      // 4. Update Application balances
      if (originalTx.payment.applicationId) {
        await tx.application.update({
          where: { id: originalTx.payment.applicationId },
          data: {
            paidAmount: effectivePaid,
            dueAmount: newDue,
          },
        });

        // 5. Activity Log
        await tx.applicationActivity.create({
          data: {
            applicationId: originalTx.payment.applicationId,
            actorId: adminActor.id,
            actorRole: UserRole.ADMIN,
            action: "PAYMENT_REVERSED",
            entityType: "PaymentTransaction",
            entityId: reversalTx.id,
            message: `Payment transaction ${originalTx.transactionNumber} of KES ${originalTx.amount.toString()} was reversed. Reason: ${reason}`,
            visibility: NoteVisibility.CLIENT_VISIBLE,
          },
        });
      }

      return reversalTx;
    });

    await recordAuditLog({
      organizationId,
      actorId: adminActor.id,
      actorRole: UserRole.ADMIN,
      action: "REVERSE_PAYMENT",
      resource: "PaymentTransaction",
      resourceId: originalTx.id,
      metadata: {
        originalTransactionNumber: originalTx.transactionNumber,
        reversalTransactionNumber: reversalTxNumber,
        amount: originalTx.amount.toString(),
        reason,
      },
    });

    return result;
  }

  /**
   * List client payment transactions
   */
  async listClientTransactions(
    clientId: string,
    organizationId: string,
    params: {
      page?: number;
      limit?: number;
      status?: PaymentStatus;
      search?: string;
    }
  ) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.PaymentTransactionWhereInput = {
      clientId,
      organizationId,
    };

    if (params.status) where.status = params.status;

    if (params.search) {
      where.OR = [
        { transactionNumber: { contains: params.search, mode: "insensitive" } },
        { externalReference: { contains: params.search, mode: "insensitive" } },
      ];
    }

    const [transactions, total] = await Promise.all([
      prisma.paymentTransaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          payment: {
            select: {
              id: true,
              invoiceNumber: true,
              totalAmount: true,
              amountPaid: true,
              amountDue: true,
            },
          },
          receipt: {
            select: {
              id: true,
              receiptNumber: true,
              issuedAt: true,
            },
          },
        },
      }),
      prisma.paymentTransaction.count({ where }),
    ]);

    return {
      data: transactions,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * List admin payment transactions
   */
  async listAdminTransactions(
    organizationId: string,
    params: {
      page?: number;
      limit?: number;
      status?: PaymentStatus;
      paymentMethod?: PaymentMethod;
      transactionType?: TransactionType;
      clientId?: string;
      paymentId?: string;
      search?: string;
      fromDate?: string;
      toDate?: string;
    }
  ) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.PaymentTransactionWhereInput = {
      organizationId,
    };

    if (params.status) where.status = params.status;
    if (params.paymentMethod) where.paymentMethod = params.paymentMethod;
    if (params.transactionType) where.transactionType = params.transactionType;
    if (params.clientId) where.clientId = params.clientId;
    if (params.paymentId) where.paymentId = params.paymentId;

    if (params.search) {
      where.OR = [
        { transactionNumber: { contains: params.search, mode: "insensitive" } },
        { externalReference: { contains: params.search, mode: "insensitive" } },
        { client: { fullName: { contains: params.search, mode: "insensitive" } } },
      ];
    }

    if (params.fromDate || params.toDate) {
      where.createdAt = {};
      if (params.fromDate) where.createdAt.gte = new Date(params.fromDate);
      if (params.toDate) where.createdAt.lte = new Date(params.toDate);
    }

    const [transactions, total] = await Promise.all([
      prisma.paymentTransaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          client: {
            select: {
              id: true,
              clientNumber: true,
              fullName: true,
              email: true,
            },
          },
          payment: {
            select: {
              id: true,
              invoiceNumber: true,
              totalAmount: true,
              amountPaid: true,
              amountDue: true,
            },
          },
          receipt: {
            select: {
              id: true,
              receiptNumber: true,
              issuedAt: true,
            },
          },
          reversalOf: true,
          reversals: true,
        },
      }),
      prisma.paymentTransaction.count({ where }),
    ]);

    return {
      data: transactions,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get single admin transaction by ID
   */
  async getAdminTransactionById(id: string, organizationId: string) {
    const transaction = await prisma.paymentTransaction.findFirst({
      where: { id, organizationId },
      include: {
        client: true,
        payment: {
          include: {
            application: true,
            lineItems: true,
          },
        },
        receipt: true,
        reversalOf: true,
        reversals: true,
        allocations: true,
        refunds: true,
      },
    });

    if (!transaction) {
      throw new NotFoundError("Payment transaction not found");
    }

    return transaction;
  }

  /**
   * Get single client transaction by ID (with IDOR protection)
   */
  async getClientTransactionById(id: string, clientId: string, organizationId: string) {
    const transaction = await prisma.paymentTransaction.findFirst({
      where: { id, clientId, organizationId },
      include: {
        client: true,
        payment: {
          include: {
            application: true,
            lineItems: true,
          },
        },
        receipt: true,
        reversalOf: true,
        reversals: true,
        allocations: true,
      },
    });

    if (!transaction) {
      throw new NotFoundError("Payment transaction not found or access denied");
    }

    return transaction;
  }
}

export const paymentService = new PaymentService();

