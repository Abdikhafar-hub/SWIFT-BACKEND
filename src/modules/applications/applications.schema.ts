import { z } from "zod";
import {
  APPLICATION_STATUSES,
  APPLICATION_PRIORITIES,
  NOTE_VISIBILITIES,
} from "../../config/constants.js";

export const createClientApplicationSchema = z.object({
  serviceId: z.string().uuid("Invalid service ID"),
  notesSummary: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

export const createAdminApplicationSchema = z.object({
  clientId: z.string().uuid("Invalid client ID"),
  serviceId: z.string().uuid("Invalid service ID"),
  priority: z.enum([
    APPLICATION_PRIORITIES.LOW,
    APPLICATION_PRIORITIES.NORMAL,
    APPLICATION_PRIORITIES.HIGH,
    APPLICATION_PRIORITIES.URGENT,
  ]).default(APPLICATION_PRIORITIES.NORMAL),
  assignedAdminId: z.string().uuid().optional().nullable(),
  notesSummary: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

export const updateApplicationStatusSchema = z.object({
  status: z.enum([
    APPLICATION_STATUSES.NEW,
    APPLICATION_STATUSES.QUALIFICATION,
    APPLICATION_STATUSES.REQUIREMENTS_PENDING,
    APPLICATION_STATUSES.DOCUMENT_REVIEW,
    APPLICATION_STATUSES.READY_FOR_SUBMISSION,
    APPLICATION_STATUSES.SUBMITTED,
    APPLICATION_STATUSES.GOVERNMENT_PROCESSING,
    APPLICATION_STATUSES.ADDITIONAL_INFORMATION_REQUIRED,
    APPLICATION_STATUSES.APPROVED,
    APPLICATION_STATUSES.DOCUMENT_RECEIVED,
    APPLICATION_STATUSES.QUALITY_CHECK,
    APPLICATION_STATUSES.READY_FOR_DELIVERY,
    APPLICATION_STATUSES.DELIVERED,
    APPLICATION_STATUSES.CLOSED,
    APPLICATION_STATUSES.ON_HOLD,
    APPLICATION_STATUSES.CANCELLED,
  ]),
  reason: z.string().optional(),
  notifyClient: z.boolean().default(true),
});

export const updateApplicationPrioritySchema = z.object({
  priority: z.enum([
    APPLICATION_PRIORITIES.LOW,
    APPLICATION_PRIORITIES.NORMAL,
    APPLICATION_PRIORITIES.HIGH,
    APPLICATION_PRIORITIES.URGENT,
  ]),
  reason: z.string().optional(),
});

export const closeApplicationSchema = z.object({
  reason: z.string().min(3, "Closure reason is required"),
  completionNotes: z.string().optional(),
});

export const assignApplicationSchema = z.object({
  assignedAdminId: z.string().uuid("Invalid admin user ID"),
  reason: z.string().optional(),
});

export const unassignApplicationSchema = z.object({
  reason: z.string().optional(),
});

export const createApplicationNoteSchema = z.object({
  content: z.string().min(1, "Note content cannot be empty"),
  visibility: z.enum([NOTE_VISIBILITIES.INTERNAL, NOTE_VISIBILITIES.CLIENT_VISIBLE]).default(NOTE_VISIBILITIES.INTERNAL),
});

export const submitRequirementSchema = z.object({
  valueText: z.string().optional(),
  valueNumber: z.number().optional(),
  valueDate: z.string().datetime().optional(),
  valueBoolean: z.boolean().optional(),
  valueJson: z.any().optional(),
  reason: z.string().optional(),
  notes: z.string().optional(),
});

export const reviewRequirementSchema = z.object({
  action: z.enum(["APPROVE", "REJECT", "REQUEST_CORRECTION"]).optional(),
  status: z.enum(["APPROVED", "REJECTED", "CORRECTION_REQUIRED"]).optional(),
  reason: z.string().optional(),
  reviewNotes: z.string().optional(),
  notes: z.string().optional(),
}).transform((data) => {
  let action = data.action;
  if (!action && data.status) {
    if (data.status === "APPROVED") action = "APPROVE";
    else if (data.status === "REJECTED") action = "REJECT";
    else if (data.status === "CORRECTION_REQUIRED") action = "REQUEST_CORRECTION";
  }
  return {
    action: action || "APPROVE",
    reason: data.reason,
    reviewNotes: data.reviewNotes || data.notes,
  };
});

export const createGovernmentApplicationSchema = z.object({
  platform: z.string().min(2, "Platform name is required (e.g. eCitizen, BRS, iTax)"),
  governmentAgency: z.string().default("eCitizen"),
  governmentService: z.string().optional(),
  externalReference: z.string().min(2, "External reference/tracking number is required"),
  status: z.string().default("NOT_STARTED"),
  statusDescription: z.string().optional(),
  portalUrl: z.string().optional(),
  notes: z.string().optional(),
});

export const listApplicationsQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  status: z.string().optional(),
  priority: z.string().optional(),
  slaStatus: z.string().optional(),
  serviceId: z.string().optional(),
  clientId: z.string().optional(),
  assignedAdminId: z.string().optional(),
  search: z.string().optional(),
});

export const workQueueQuerySchema = z.object({
  status: z.string().optional(),
  assignedAdminId: z.string().optional(),
  serviceId: z.string().optional(),
  priority: z.string().optional(),
  slaStatus: z.string().optional(),
  needsAttention: z.enum(["true", "false"]).optional(),
  overdue: z.enum(["true", "false"]).optional(),
  search: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

export const workloadQueueQuerySchema = z.object({
  queue: z.string().optional(),
  queueType: z.string().optional(),
  assignedAdminId: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});


