import { z } from "zod";

export const snapPointSchema = z.object({
  lat: z.number(),
  lon: z.number(),
  // false when dragging an existing point that isn't the route's start — skips the geocode
  // lookup, since only the start point's label ("Running from X") needs a location resolved.
  includeLocation: z.boolean().optional().default(true),
});

export const calculateRouteSchema = z.object({
  points: z.array(z.object({ lat: z.number(), lon: z.number() })).min(2),
});
