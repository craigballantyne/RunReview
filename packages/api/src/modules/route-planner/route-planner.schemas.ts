import { z } from "zod";

export const snapStartPointSchema = z.object({
  lat: z.number(),
  lon: z.number(),
});

export const calculateRouteSchema = z.object({
  points: z.array(z.object({ lat: z.number(), lon: z.number() })).min(2),
});
