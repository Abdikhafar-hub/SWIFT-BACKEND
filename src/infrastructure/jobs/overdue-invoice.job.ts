import { prisma } from "../database/prisma.js";
import { PaymentStatus, UserRole } from "@prisma/client";
import { notificationOrchestrator } from "../../modules/notifications/notification-orchestrator.service.js";

export async function runOverdueInvoiceJob(payload?: { organizationId?: string }) {
  const now = new Date();
  const where: any = {
    amountDue: { gt: 0 },
    dueAt: { lt: now },
    status: { in: [PaymentStatus.ISSUED, PaymentStatus.PENDING, PaymentStatus.PARTIALLY_PAID] },
    deletedAt: null,
  };

  if (payload?.organizationId) {
    where.organizationId = payload.organizationId;
  }

  const overdueInvoices = await prisma.payment.findMany({
    where,
    include: {
      client: {
        include: { user: true },
      },
      application: {
        include: { service: true },
      },
    },
  });

  let processedCount = 0;

  for (const invoice of overdueInvoices) {
    await prisma.$transaction(async (tx) => {
      // 1. Mark as overdue
      await tx.payment.update({
        where: { id: invoice.id },
        data: {
          isOverdue: true,
          status: invoice.amountPaid.isZero() ? PaymentStatus.OVERDUE : PaymentStatus.PARTIALLY_PAID,
        },
      });

      // 2. Application activity
      if (invoice.applicationId) {
        await tx.applicationActivity.create({
          data: {
            applicationId: invoice.applicationId,
            actorRole: UserRole.ADMIN,
            action: "INVOICE_OVERDUE",
            message: `Invoice ${invoice.invoiceNumber} has passed its due date (${invoice.dueAt?.toLocaleDateString()}). Balance outstanding: KES ${invoice.amountDue.toString()}`,
            metadata: {
              invoiceId: invoice.id,
              invoiceNumber: invoice.invoiceNumber,
              amountDue: invoice.amountDue.toString(),
            },
          },
        });
      }
    });

    // 3. Send payment reminder / overdue notification
    if (invoice.client?.user && invoice.application) {
      notificationOrchestrator
        .notifyPaymentReminder(
          {
            organizationId: invoice.organizationId,
            applicationId: invoice.application.id,
            applicationNumber: invoice.application.applicationNumber,
            serviceName: invoice.application.service?.name || "Service",
            clientUserId: invoice.client.user.id,
            clientName: invoice.client.fullName,
            clientEmail: invoice.client.email,
            clientPhone: invoice.client.phone,
          },
          {
            invoiceNumber: invoice.invoiceNumber,
            amountDue: invoice.amountDue.toString(),
            dueDate: invoice.dueAt?.toLocaleDateString() || "Immediately",
          }
        )
        .catch((err) => console.error("[OverdueInvoiceJob] Failed to send reminder:", err));
    }

    processedCount++;
  }

  return {
    processedCount,
    timestamp: new Date().toISOString(),
  };
}
