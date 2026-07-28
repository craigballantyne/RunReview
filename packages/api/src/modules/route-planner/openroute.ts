import PQueue from "p-queue";
import type { Env } from "../../config/env.js";

// Live interactive traffic, not a background import batch — tighter than geocode.ts's 1.1s
// Nominatim throttle, but still defensive against OpenRouteService's free-tier per-minute cap.
// Confirm the actual limit for your account and tune once you have a real key.
const ORS_MIN_INTERVAL_MS = 1000;
const SNAP_RADIUS_M = 350; // OpenRouteService's own default max snapping radius
const PROFILE = "foot-walking";
const ORS_BASE_URL = "https://api.openrouteservice.org";
const EARTH_RADIUS_M = 6371000;

export interface LatLon {
  lat: number;
  lon: number;
}

export interface ElevationPoint {
  /** Cumulative distance from the route's start, in meters. */
  distanceM: number;
  elevationM: number;
}

export interface RouteResult {
  geometryLatLng: [number, number][];
  distanceM: number;
  ascentM: number;
  descentM: number;
  /** Each input point's position snapped onto the drawn route, so markers sit on the line
   * instead of floating at the raw click position. */
  snappedPoints: LatLon[];
  /** One entry per geometry point, for the route planner's elevation-vs-distance chart. */
  elevationProfile: ElevationPoint[];
}

/** Thrown on a failed route calculation — unlike geocode.ts/weather.ts's silent-null philosophy,
 * this is a live interactive user action, so the caller should surface a real error rather than
 * fail quietly. */
export class RouteCalculationError extends Error {}

// Confirmed against a live response (real API key, 2026-07-28): ascent/descent are top-level
// properties on `properties`, NOT nested under `properties.summary` as first guessed — elevation
// itself is correctly embedded as coordinates[][2] via the `elevation: true` request param, and
// auth via the Authorization header worked as expected.
interface OrsSnapResponse {
  locations?: Array<{ location: [number, number] } | null>;
}

interface OrsDirectionsResponse {
  features?: Array<{
    geometry?: { coordinates?: [number, number, number?][] };
    properties?: {
      summary?: { distance?: number };
      ascent?: number;
      descent?: number;
    };
  }>;
}

export interface RouteService {
  /** Single-point snap, used only for the very first route point — there's no route yet to
   * derive a snapped position from via `calculateRoute`. Null on any failure (caller falls back
   * to the raw clicked coordinates rather than blocking). */
  snapToRoad(point: LatLon): Promise<LatLon | null>;
  /** Throws RouteCalculationError on failure — this is the interactive path, not best-effort. */
  calculateRoute(points: LatLon[]): Promise<RouteResult>;
}

function haversineDistanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** Builds one point per geometry coordinate, walking cumulative distance from the route start —
 * this is what makes an elevation-vs-distance chart possible, since ORS's own summary only gives
 * the route's total distance, not a running total per point. */
function buildElevationProfile(coordinates: [number, number, number?][]): ElevationPoint[] {
  let cumulativeDistanceM = 0;
  return coordinates.map((coord, i) => {
    const [lon, lat, elevation] = coord;
    if (i > 0) {
      const [prevLon, prevLat] = coordinates[i - 1]!;
      cumulativeDistanceM += haversineDistanceM(prevLat, prevLon, lat, lon);
    }
    return { distanceM: cumulativeDistanceM, elevationM: elevation ?? 0 };
  });
}

function nearestPointOnGeometry(point: LatLon, geometry: [number, number][]): LatLon {
  let best = geometry[0]!;
  let bestDistSq = Infinity;
  for (const candidate of geometry) {
    const dLat = candidate[0] - point.lat;
    const dLon = candidate[1] - point.lon;
    const distSq = dLat * dLat + dLon * dLon;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      best = candidate;
    }
  }
  return { lat: best[0], lon: best[1] };
}

export function createRouteService(config: Env): RouteService {
  const queue = new PQueue({ concurrency: 1, interval: ORS_MIN_INTERVAL_MS, intervalCap: 1 });

  function authHeaders(): Record<string, string> {
    return {
      Authorization: config.OPENROUTESERVICE_API_KEY,
      "Content-Type": "application/json",
    };
  }

  async function fetchSnap(point: LatLon): Promise<LatLon | null> {
    const response = await fetch(`${ORS_BASE_URL}/v2/snap/${PROFILE}/json`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ locations: [[point.lon, point.lat]], radius: SNAP_RADIUS_M }),
    });
    if (!response.ok) return null;

    const body = (await response.json()) as OrsSnapResponse;
    const snapped = body.locations?.[0]?.location;
    if (!snapped) return null;
    return { lat: snapped[1], lon: snapped[0] };
  }

  async function fetchDirections(points: LatLon[]): Promise<RouteResult> {
    const response = await fetch(`${ORS_BASE_URL}/v2/directions/${PROFILE}/geojson`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ coordinates: points.map((p) => [p.lon, p.lat]), elevation: true }),
    });

    if (!response.ok) {
      throw new RouteCalculationError(`OpenRouteService responded with ${response.status}`);
    }

    const body = (await response.json()) as OrsDirectionsResponse;
    const feature = body.features?.[0];
    const coordinates = feature?.geometry?.coordinates;
    const summary = feature?.properties?.summary;
    if (!coordinates || coordinates.length === 0 || !summary) {
      throw new RouteCalculationError("OpenRouteService returned an unusable route");
    }

    const geometryLatLng: [number, number][] = coordinates.map(([lon, lat]) => [lat, lon]);

    return {
      geometryLatLng,
      distanceM: summary.distance ?? 0,
      ascentM: feature.properties?.ascent ?? 0,
      descentM: feature.properties?.descent ?? 0,
      // Derived by nearest-point-on-line rather than trusting an ORS-provided per-waypoint index
      // (that field's exact shape isn't confirmed) — self-contained and robust either way.
      snappedPoints: points.map((p) => nearestPointOnGeometry(p, geometryLatLng)),
      elevationProfile: buildElevationProfile(coordinates),
    };
  }

  return {
    async snapToRoad(point) {
      try {
        const result = await queue.add(() => fetchSnap(point));
        return result ?? null;
      } catch {
        return null;
      }
    },
    async calculateRoute(points) {
      const result = await queue.add(() => fetchDirections(points));
      if (!result) {
        throw new RouteCalculationError("OpenRouteService route calculation did not complete");
      }
      return result;
    },
  };
}
