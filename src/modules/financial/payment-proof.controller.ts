import { Response } from "express";
import { AuthenticatedRequest } from "../../common/types/index.js";
import { paymentProofService } from "./payment-proof.service.js";
import { ForbiddenError, BadRequestError } from "../../common/errors/app-error.js";
import { prisma } from "../../infrastructure/database/prisma.js";

export class PaymentProofController {
  async submitPaymentProof(req: AuthenticatedRequest, res: Response) {
    let clientId = req.user?.clientId;

    if (!clientId && req.user?.id) {
      const clientProfile = await prisma.client.findUnique({
        where: { userId: req.user.id },
      });
      clientId = clientProfile?.id;
    }

    if (!clientId) {
      throw new ForbiddenError("Client profile record not found for authenticated user");
    }

    const submission = await paymentProofService.submitPaymentProof({
      invoiceId: req.params.id as string,
      clientId,
      organizationId: req.user!.organizationId,
      paymentMethod: req.body.paymentMethod,
      claimedAmount: req.body.claimedAmount,
      paymentDate: req.body.paymentDate,
      referenceNumber: req.body.referenceNumber,
      notes: req.body.notes,
      fileName: req.body.fileName,
      mimeType: req.body.mimeType,
      base64Data: req.body.base64Data,
    });

    return res.status(201).json({
      success: true,
      message: "Payment proof submitted successfully and is under review.",
      data: submission,
    });
  }

  async listPaymentProofs(req: AuthenticatedRequest, res: Response) {
    const result = await paymentProofService.listPaymentProofs(
      req.user!.organizationId,
      {
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 20,
        status: req.query.status as any,
        search: req.query.search as string,
      }
    );

    return res.status(200).json({
      success: true,
      ...result,
    });
  }

  async getPaymentProofById(req: AuthenticatedRequest, res: Response) {
    const isClient = req.user!.role === "CLIENT";
    let clientId: string | undefined;

    if (isClient) {
      clientId = req.user?.clientId || undefined;
      if (!clientId && req.user?.id) {
        const clientProfile = await prisma.client.findUnique({
          where: { userId: req.user.id },
        });
        clientId = clientProfile?.id;
      }
    }

    const proof = await paymentProofService.getPaymentProofById(
      req.params.id as string,
      req.user!.organizationId,
      clientId
    );

    return res.status(200).json({
      success: true,
      data: proof,
    });
  }

  async approvePaymentProof(req: AuthenticatedRequest, res: Response) {
    const result = await paymentProofService.approvePaymentProof(
      req.params.id as string,
      req.user!.organizationId,
      {
        id: req.user!.id,
        email: req.user!.email,
      }
    );

    return res.status(200).json({
      success: true,
      message: "Payment proof approved successfully. Payment transaction and statutory receipt recorded.",
      data: result,
    });
  }

  async rejectPaymentProof(req: AuthenticatedRequest, res: Response) {
    const { rejectionReason } = req.body;
    if (!rejectionReason) {
      throw new BadRequestError("Rejection reason is required");
    }

    const result = await paymentProofService.rejectPaymentProof(
      req.params.id as string,
      req.user!.organizationId,
      rejectionReason,
      {
        id: req.user!.id,
        email: req.user!.email,
      }
    );

    return res.status(200).json({
      success: true,
      message: "Payment proof rejected. Client notified with rejection details.",
      data: result,
    });
  }
}

export const paymentProofController = new PaymentProofController();
