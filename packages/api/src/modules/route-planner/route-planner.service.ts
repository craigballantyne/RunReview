import type { PrismaClient } from "@prisma/client";
import type { Geocoder } from "../import/geocode.js";
import type { LatLon, RouteResult, RouteService } from "./openroute.js";

export interface RoutePlannerServiceDeps {
  prisma: PrismaClient;
  routeService: RouteService;
  geocoder: Geocoder;
}

export interface SnapPointResult {
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

    /** Snaps a route point to the nearest road/path — used both for placing the very first point
     * and for repositioning any existing point via drag-and-drop. Falls back to the raw
     * coordinates if snapping fails — better to place the marker somewhere than block the user
     * over a supplementary lookup failing. Resolves a street-level label (not locality/country —
     * see reverseGeocodeStreet's doc comment) only when `includeLocation` is true, since that's
     * only meaningful for the start point's "Running from X" title — skipping it for every other
     * point drag avoids an unnecessary geocode call. */
    async snapPoint(lat: number, lon: number, includeLocation: boolean): Promise<SnapPointResult> {
      const snapped = (await routeService.snapToRoad({ lat, lon })) ?? { lat, lon };
      const location = includeLocation ? await geocoder.reverseGeocodeStreet(snapped.lat, snapped.lon) : null;
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
