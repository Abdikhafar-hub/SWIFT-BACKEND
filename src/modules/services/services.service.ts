import { prisma } from "../../infrastructure/database/prisma.js";
import { NotFoundError } from "../../common/errors/app-error.js";
import { createAuditLog } from "../../common/utils/audit.js";
import { UserRole, Prisma } from "@prisma/client";

export class ServiceCatalogService {
  async listCategories(organizationId?: string) {
    const orgId = organizationId || (await prisma.organization.findFirst({ where: { slug: "swift-doc" } }))?.id || "";
    return prisma.serviceCategory.findMany({
      where: {
        organizationId: orgId,
        active: true,
      },
      orderBy: { displayOrder: "asc" },
    });
  }

  async listPublicServices(organizationId: string, categorySlug?: string) {
    return prisma.serviceCategory.findMany({
      where: {
        organizationId,
        active: true,
        slug: categorySlug ? categorySlug : undefined,
      },
      orderBy: { displayOrder: "asc" },
      include: {
        services: {
          where: {
            active: true,
            publiclyVisible: true,
            deletedAt: null,
          },
          orderBy: { displayOrder: "asc" },
          include: {
            requirements: {
              where: { active: true },
              orderBy: { displayOrder: "asc" },
            },
          },
        },
      },
    });
  }

  async getServiceBySlugOrId(identifier: string, organizationId: string) {
    const service = await prisma.service.findFirst({
      where: {
        organizationId,
        deletedAt: null,
        OR: [{ id: identifier }, { slug: identifier }, { code: identifier }],
      },
      include: {
        category: true,
        requirements: {
          where: { active: true },
          orderBy: { displayOrder: "asc" },
        },
      },
    });

    if (!service) {
      throw new NotFoundError("Service");
    }

    return service;
  }

  async listAdminServices(organizationId: string) {
    return prisma.service.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: [{ categoryId: "asc" }, { displayOrder: "asc" }],
      include: {
        category: true,
        requirements: {
          orderBy: { displayOrder: "asc" },
        },
        _count: {
          select: { applications: true },
        },
      },
    });
  }

  async createService(organizationId: string, data: any, adminActorId: string) {
    const { requirements, ...serviceFields } = data;

    const service = await prisma.$transaction(async (tx) => {
      const created = await tx.service.create({
        data: {
          organizationId,
          categoryId: serviceFields.categoryId,
          code: serviceFields.code,
          slug: serviceFields.slug,
          name: serviceFields.name,
          description: serviceFields.description,
          active: serviceFields.active ?? true,
          publiclyVisible: serviceFields.publiclyVisible ?? true,
          estimatedDuration: serviceFields.estimatedDuration,
          slaHours: serviceFields.slaHours ?? 72,
          requiresGovernmentProcess: serviceFields.requiresGovernmentProcess ?? true,
          requiresDocumentReview: serviceFields.requiresDocumentReview ?? true,
          requiresPayment: serviceFields.requiresPayment ?? true,
          governmentFee: new Prisma.Decimal(serviceFields.governmentFee || 0),
          serviceFee: new Prisma.Decimal(serviceFields.serviceFee || 0),
        },
      });

      if (requirements && requirements.length > 0) {
        for (let i = 0; i < requirements.length; i++) {
          const req = requirements[i];
          await tx.serviceRequirement.create({
            data: {
              serviceId: created.id,
              code: req.code,
              name: req.name,
              description: req.description,
              type: req.type,
              required: req.required ?? true,
              options: req.options,
              fileTypes: req.fileTypes,
              maxFileSizeMb: req.maxFileSizeMb ?? 10,
              displayOrder: req.displayOrder ?? i + 1,
            },
          });
        }
      }

      await createAuditLog(
        {
          organizationId,
          actorId: adminActorId,
          actorRole: UserRole.ADMIN,
          action: "SERVICE_CREATED",
          resource: "Service",
          resourceId: created.id,
          metadata: { name: created.name, code: created.code },
        },
        tx
      );

      return created;
    });

    return this.getServiceBySlugOrId(service.id, organizationId);
  }

  async updateService(serviceId: string, organizationId: string, data: any, adminActorId: string) {
    const existing = await prisma.service.findFirst({
      where: { id: serviceId, organizationId, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundError("Service");
    }

    const { requirements, ...serviceFields } = data;

    await prisma.$transaction(async (tx) => {
      await tx.service.update({
        where: { id: serviceId },
        data: {
          ...serviceFields,
          governmentFee: serviceFields.governmentFee !== undefined ? new Prisma.Decimal(serviceFields.governmentFee) : undefined,
          serviceFee: serviceFields.serviceFee !== undefined ? new Prisma.Decimal(serviceFields.serviceFee) : undefined,
        },
      });

      if (requirements && Array.isArray(requirements)) {
        // Upsert requirements
        for (let i = 0; i < requirements.length; i++) {
          const req = requirements[i];
          await tx.serviceRequirement.upsert({
            where: {
              serviceId_code: {
                serviceId,
                code: req.code,
              },
            },
            update: {
              name: req.name,
              description: req.description,
              type: req.type,
              required: req.required,
              options: req.options,
              fileTypes: req.fileTypes,
              maxFileSizeMb: req.maxFileSizeMb,
              displayOrder: req.displayOrder ?? i + 1,
              active: req.active ?? true,
            },
            create: {
              serviceId,
              code: req.code,
              name: req.name,
              description: req.description,
              type: req.type,
              required: req.required ?? true,
              options: req.options,
              fileTypes: req.fileTypes,
              maxFileSizeMb: req.maxFileSizeMb ?? 10,
              displayOrder: req.displayOrder ?? i + 1,
            },
          });
        }
      }

      await createAuditLog(
        {
          organizationId,
          actorId: adminActorId,
          actorRole: UserRole.ADMIN,
          action: "SERVICE_UPDATED",
          resource: "Service",
          resourceId: serviceId,
        },
        tx
      );
    });

    return this.getServiceBySlugOrId(serviceId, organizationId);
  }
}

export const serviceCatalogService = new ServiceCatalogService();
