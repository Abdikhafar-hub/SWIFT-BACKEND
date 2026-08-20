import { z } from "zod";

export const performQualityCheckSchema = z.object({
  result: z.enum(["PASSED", "FAILED"]),
  checklist: z.record(z.boolean()),
  notes: z.string().optional(),
  failedReason: z.string().optional(),
});
