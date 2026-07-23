import type { TrackPoint } from "@run-review/shared";

export interface RouteCoordinate {
  lat: number;
  lng: number;
}

/**
 * Filters track points down to those with a valid position. Real GPS traces commonly have a
 * null-position prefix before the device acquires a lock — those points are dropped rather than
 * treated as missing-data for the whole run.
 */
export function buildRouteCoordinates(trackPoints: TrackPoint[]): RouteCoordinate[] {
  return trackPoints
    .filter((p): p is TrackPoint & { latitude: number; longitude: number } => p.latitude !== null && p.longitude !== null)
    .sort((a, b) => a.pointIndex - b.pointIndex)
    .map((p) => ({ lat: p.latitude, lng: p.longitude }));
}
