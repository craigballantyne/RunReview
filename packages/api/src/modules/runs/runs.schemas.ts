import { z } from "zod";

export const listRunsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const runIdParamsSchema = z.object({
  id: z.string().uuid(),
});
