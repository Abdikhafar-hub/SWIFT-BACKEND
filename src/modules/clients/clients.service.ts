import { prisma } from "../../infrastructure/database/prisma.js";
import { Prisma, UserRole } from "@prisma/client";
import { NotFoundError, BadRequestError } from "../../common/errors/app-error.js";
import { generateClientNumber } from "../../common/utils/generators.js";
import { detectDuplicateClient } from "../../common/utils/duplicate-detector.js";
import { createAuditLog } from "../../common/utils/audit.js";
import { PaginatedResult } from "../../common/types/index.js";
import { storageService } from "../../infrastructure/storage/index.js";
import { emailService } from "../../infrastructure/email/index.js";

export class ClientService {
  async getClientProfile(clientId: string) {
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      include: {
        applications: {
          select: {
            id: true,
            applicationNumber: true,
            status: true,
            priority: true,
            slaStatus: true,
            createdAt: true,
            service: {
              select: {
                name: true,
                code: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 5,
        },
      },
    });

    if (!client || client.deletedAt) {
      throw new NotFoundError("Client profile");
    }

    return client;
  }

  async updateClientProfile(clientId: string, data: Prisma.ClientUpdateInput, actorId?: string, actorRole?: UserRole) {
    const existing = await prisma.client.findUnique({
      where: { id: clientId },
      include: { user: true },
    });

    if (!existing || existing.deletedAt) {
      throw new NotFoundError("Client profile");
    }

    const updated = await prisma.client.update({
      where: { id: clientId },
      data,
    });

    // Check if onboarding was completed with verified email
    if (existing.user && existing.user.isEmailVerified && !existing.user.onboardingCompleted) {
      await prisma.user.update({
        where: { id: existing.user.id },
        data: {
          onboardingCompleted: true,
          onboardingCompletedAt: new Date(),
        },
      });

      // DISPATCH WELCOME EMAIL NOW - Only after email verification & profile onboarding!
      void emailService.sendWelcomeEmail(existing.user.email, updated.fullName, updated.clientNumber);
    }

    await createAuditLog({
      organizationId: existing.organizationId,
      actorId,
      actorRole,
      action: "CLIENT_PROFILE_UPDATED",
      resource: "Client",
      resourceId: clientId,
      metadata: { changes: Object.keys(data) },
    });

    return updated;
  }

  async listClients(
    organizationId: string,
    params: {
      page: number;
      limit: number;
      search?: string;
      clientType?: any;
      isDuplicateFlagged?: boolean;
      isReviewed?: boolean;
    }
  ): Promise<PaginatedResult<any>> {
    const skip = (params.page - 1) * params.limit;

    const where: Prisma.ClientWhereInput = {
      organizationId,
      deletedAt: null,
      clientType: params.clientType || undefined,
      isDuplicateFlagged: params.isDuplicateFlagged !== undefined ? params.isDuplicateFlagged : undefined,
      isReviewed: params.isReviewed !== undefined ? params.isReviewed : undefined,
    };

    if (params.search && params.search.trim()) {
      const q = params.search.trim();
      where.OR = [
        { fullName: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { phone: { contains: q } },
        { clientNumber: { contains: q, mode: "insensitive" } },
        { businessName: { contains: q, mode: "insensitive" } },
        { nationalId: { contains: q } },
        { kraPin: { contains: q, mode: "insensitive" } },
      ];
    }

    const [total, items] = await Promise.all([
      prisma.client.count({ where }),
      prisma.client.findMany({
        where,
        skip,
        take: params.limit,
        orderBy: { createdAt: "desc" },
        include: {
          reviewedBy: {
            select: {
              id: true,
              email: true,
            },
          },
          _count: {
            select: {
              applications: true,
              documents: true,
            },
          },
        },
      }),
    ]);

    const totalPages = Math.ceil(total / params.limit) || 1;

    return {
      items,
      meta: {
        total,
        page: params.page,
        limit: params.limit,
        totalPages,
        hasNextPage: params.page < totalPages,
        hasPrevPage: params.page > 1,
      },
    };
  }

  async listRegistrations(
    organizationId: string,
    params: {
      page: number;
      limit: number;
      search?: string;
      clientType?: any;
      isDuplicateFlagged?: boolean;
      isReviewed?: boolean;
    }
  ): Promise<PaginatedResult<any>> {
    const skip = (params.page - 1) * params.limit;

    const where: Prisma.ClientWhereInput = {
      organizationId,
      deletedAt: null,
      isReviewed: params.isReviewed !== undefined ? params.isReviewed : false,
      clientType: params.clientType || undefined,
      isDuplicateFlagged: params.isDuplicateFlagged !== undefined ? params.isDuplicateFlagged : undefined,
    };

    if (params.search && params.search.trim()) {
      const q = params.search.trim();
      where.OR = [
        { fullName: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { phone: { contains: q } },
        { clientNumber: { contains: q, mode: "insensitive" } },
        { businessName: { contains: q, mode: "insensitive" } },
        { nationalId: { contains: q } },
        { kraPin: { contains: q, mode: "insensitive" } },
      ];
    }

    const [total, items] = await Promise.all([
      prisma.client.count({ where }),
      prisma.client.findMany({
        where,
        skip,
        take: params.limit,
        orderBy: { createdAt: "desc" },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              isEmailVerified: true,
              lastLoginAt: true,
              createdAt: true,
            },
          },
          reviewedBy: {
            select: {
              id: true,
              email: true,
            },
          },
          _count: {
            select: {
              applications: true,
              documents: true,
            },
          },
        },
      }),
    ]);

    const totalPages = Math.ceil(total / params.limit) || 1;

    return {
      items,
      meta: {
        total,
        page: params.page,
        limit: params.limit,
        totalPages,
        hasNextPage: params.page < totalPages,
        hasPrevPage: params.page > 1,
      },
    };
  }

  async reviewRegistration(
    clientId: string,
    organizationId: string,
    adminActorId: string,
    data: {
      reviewNotes?: string;
      isDuplicateFlagged?: boolean;
      duplicateReason?: string | null;
    }
  ) {
    const client = await prisma.client.findFirst({
      where: { id: clientId, organizationId, deletedAt: null },
    });

    if (!client) {
      throw new NotFoundError("Client registration");
    }

    const updated = await prisma.client.update({
      where: { id: clientId },
      data: {
        isReviewed: true,
        reviewedAt: new Date(),
        reviewedById: adminActorId,
        reviewNotes: data.reviewNotes !== undefined ? data.reviewNotes : client.reviewNotes,
        isDuplicateFlagged: data.isDuplicateFlagged !== undefined ? data.isDuplicateFlagged : client.isDuplicateFlagged,
        duplicateReason: data.duplicateReason !== undefined ? data.duplicateReason : client.duplicateReason,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            isEmailVerified: true,
            createdAt: true,
          },
        },
        reviewedBy: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });

    await createAuditLog({
      organizationId,
      actorId: adminActorId,
      actorRole: UserRole.ADMIN,
      action: "ADMIN_REVIEWED_CLIENT_REGISTRATION",
      resource: "Client",
      resourceId: clientId,
      metadata: {
        clientNumber: client.clientNumber,
        clientName: client.fullName,
        reviewNotes: data.reviewNotes,
        isDuplicateFlagged: data.isDuplicateFlagged,
      },
    });

    return updated;
  }

  async getAdminClientById(clientId: string, organizationId: string) {
    const client = await prisma.client.findFirst({
      where: { id: clientId, organizationId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            isEmailVerified: true,
            lastLoginAt: true,
            createdAt: true,
          },
        },
        reviewedBy: {
          select: {
            id: true,
            email: true,
          },
        },
        applications: {
          include: {
            service: { select: { name: true, code: true } },
            assignedAdmin: { select: { id: true, email: true } },
          },
          orderBy: { createdAt: "desc" },
        },
        documents: {
          include: {
            versions: { orderBy: { versionNumber: "desc" }, take: 1 },
          },
        },
        payments: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!client || client.deletedAt) {
      throw new NotFoundError("Client");
    }

    return client;
  }

  async createAdminClient(organizationId: string, data: any, adminActorId: string) {
    const duplicateCheck = await detectDuplicateClient({
      organizationId,
      email: data.email,
      phone: data.phone,
      nationalId: data.nationalId,
      passportNumber: data.passportNumber,
      kraPin: data.kraPin,
      businessName: data.businessName,
    });

    const clientNumber = await generateClientNumber(organizationId);

    const client = await prisma.client.create({
      data: {
        organizationId,
        clientNumber,
        clientType: data.clientType,
        fullName: data.fullName.trim(),
        businessName: data.businessName?.trim() || null,
        email: data.email.trim().toLowerCase(),
        phone: data.phone.trim(),
        alternatePhone: data.alternatePhone?.trim() || null,
        nationality: data.nationality || "Kenyan",
        nationalId: data.nationalId?.trim() || null,
        passportNumber: data.passportNumber?.trim() || null,
        kraPin: data.kraPin?.trim() || null,
        address: data.address?.trim() || null,
        county: data.county?.trim() || null,
        city: data.city?.trim() || null,
        postalAddress: data.postalAddress?.trim() || null,
        preferredCommunicationChannel: data.preferredCommunicationChannel,
        isDuplicateFlagged: duplicateCheck.isDuplicateFound,
        duplicateReason: duplicateCheck.isDuplicateFound ? duplicateCheck.reasons.join("; ") : null,
        isReviewed: true, // Directly created by admin, so marked reviewed
        reviewedAt: new Date(),
        reviewedById: adminActorId,
      },
    });

    await createAuditLog({
      organizationId,
      actorId: adminActorId,
      actorRole: UserRole.ADMIN,
      action: "ADMIN_CREATED_CLIENT",
      resource: "Client",
      resourceId: client.id,
      metadata: {
        clientNumber,
        isDuplicateFlagged: duplicateCheck.isDuplicateFound,
      },
    });

    return client;
  }

  async uploadProfileImage(userId: string, input: { fileName: string; mimeType: string; base64Data: string }) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundError("User not found");
    }

    const base64Clean = input.base64Data.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, "");
    const buffer = Buffer.from(base64Clean, "base64");

    const MAX_SIZE = 5 * 1024 * 1024;
    if (buffer.length > MAX_SIZE) {
      throw new BadRequestError("Profile image must be less than 5MB in size");
    }

    let mimeType = input.mimeType.toLowerCase();
    if (mimeType === "image/jpg" || mimeType === "image/pjpeg") {
      mimeType = "image/jpeg";
    }

    const uploadResult = await storageService.upload({
      buffer,
      fileName: input.fileName,
      mimeType,
      folder: "avatars",
    });

    await prisma.user.update({
      where: { id: userId },
      data: {
        avatarUrl: uploadResult.secureUrl,
      },
    });

    await createAuditLog({
      organizationId: user.organizationId,
      actorId: user.id,
      actorEmail: user.email,
      actorRole: UserRole.CLIENT,
      action: "CLIENT_PROFILE_IMAGE_UPLOADED",
      resource: "User",
      resourceId: user.id,
      metadata: { secureUrl: uploadResult.secureUrl, fileSize: buffer.length },
    });

    return {
      avatarUrl: uploadResult.secureUrl,
    };
  }

  async deleteProfileImage(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundError("User not found");
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        avatarUrl: null,
      },
    });

    await createAuditLog({
      organizationId: user.organizationId,
      actorId: user.id,
      actorEmail: user.email,
      actorRole: UserRole.CLIENT,
      action: "CLIENT_PROFILE_IMAGE_DELETED",
      resource: "User",
      resourceId: user.id,
    });

    return { success: true };
  }
}

export const clientService = new ClientService();
