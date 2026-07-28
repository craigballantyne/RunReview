import type { PrismaClient } from "@prisma/client";
import type { Geocoder } from "../import/geocode.js";
import type { LatLon, RouteResult, RouteService } from "./openroute.js";

export interface RoutePlannerServiceDeps {
  prisma: PrismaClient;
  routeService: RouteService;
  geocoder: Geocoder;
}

export interface StartPointResult {
  lat: number;
  lon: number;
  location: string | null;
}

export function createRoutePlannerService({ prisma, routeService, geocoder }: RoutePlannerServiceDeps) {
  return {
    /** All of the user's track points across every run, for the heatmap layer — no capping, per
     * spec's "all track points should be used"; a known perf consideration for very active users,
     * not solved here. */
    async getHeatmapPoints(userId: string): Promise<[number, number][]> {
      const points = await prisma.trackPoint.findMany({
        where: { run: { userId }, latitude: { not: null }, longitude: { not: null } },
        select: { latitude: true, longitude: true },
      });
      return points
        .filter((p): p is { latitude: number; longitude: number } => p.latitude !== null && p.longitude !== null)
        .map((p) => [p.latitude, p.longitude]);
    },

    /** Snaps the very first route point to the nearest road/path and resolves a street-level
     * label for it (not locality/country — see reverseGeocodeStreet's doc comment). Falls back to
     * the raw clicked coordinates if snapping fails — better to place the marker somewhere than
     * block the user over a supplementary lookup failing. */
    async snapStartPoint(lat: number, lon: number): Promise<StartPointResult> {
      const snapped = (await routeService.snapToRoad({ lat, lon })) ?? { lat, lon };
      const location = await geocoder.reverseGeocodeStreet(snapped.lat, snapped.lon);
      return { lat: snapped.lat, lon: snapped.lon, location };
    },

    /** Throws RouteCalculationError on failure (from openroute.ts) — this is a live interactive
     * action, so the route handler should turn that into a real user-facing error, not swallow it. */
    async calculateRoute(points: LatLon[]): Promise<RouteResult> {
      return routeService.calculateRoute(points);
    },
  };
}

export type RoutePlannerService = ReturnType<typeof createRoutePlannerService>;
