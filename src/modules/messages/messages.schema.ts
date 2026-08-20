import { z } from "zod";
import { NOTE_VISIBILITIES } from "../../config/constants.js";

export const sendMessageSchema = z.object({
  applicationId: z.string().optional(),
  subject: z.string().optional(),
  message: z.string().min(1, "Message content cannot be empty"),
  channel: z.enum(["IN_APP", "EMAIL", "SMS"]).default("IN_APP"),
  sendEmail: z.boolean().optional().default(false),
  sendSms: z.boolean().optional().default(false),
  visibility: z
    .enum([NOTE_VISIBILITIES.INTERNAL, NOTE_VISIBILITIES.CLIENT_VISIBLE])
    .default(NOTE_VISIBILITIES.CLIENT_VISIBLE),
  attachments: z
    .array(
      z.object({
        fileName: z.string().min(1),
        fileUrl: z.string().url("Invalid attachment URL"),
        fileSize: z.number().min(1),
        mimeType: z.string().min(1),
      })
    )
    .optional(),
});
