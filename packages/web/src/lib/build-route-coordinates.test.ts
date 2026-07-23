import { describe, expect, it } from "vitest";
import type { TrackPoint } from "@run-review/shared";
import { buildRouteCoordinates } from "./build-route-coordinates.js";

function point(overrides: Partial<TrackPoint>): TrackPoint {
  return {
    id: "1",
    pointIndex: 0,
    elapsedSec: 0,
    latitude: null,
    longitude: null,
    elevationM: null,
    heartRate: null,
    speedMps: null,
    ...overrides,
  };
}

describe("buildRouteCoordinates", () => {
  it("filters out points with null lat/long (pre-GPS-lock) and keeps the rest", () => {
    const points = [
      point({ pointIndex: 0, latitude: null, longitude: null }),
      point({ pointIndex: 1, latitude: null, longitude: null }),
      point({ pointIndex: 2, latitude: 55.95, longitude: -3.24 }),
      point({ pointIndex: 3, latitude: 55.96, longitude: -3.25 }),
    ];

    expect(buildRouteCoordinates(points)).toEqual([
      { lat: 55.95, lng: -3.24 },
      { lat: 55.96, lng: -3.25 },
    ]);
  });

  it("returns an empty array when every point lacks a position, signalling 'no mapping data'", () => {
    const points = [point({ pointIndex: 0 }), point({ pointIndex: 1 })];
    expect(buildRouteCoordinates(points)).toEqual([]);
  });

  it("returns an empty array for an empty track point list", () => {
    expect(buildRouteCoordinates([])).toEqual([]);
  });

  it("sorts by pointIndex even if the input array is out of order", () => {
    const points = [
      point({ pointIndex: 2, latitude: 3, longitude: 3 }),
      point({ pointIndex: 0, latitude: 1, longitude: 1 }),
      point({ pointIndex: 1, latitude: 2, longitude: 2 }),
    ];
    expect(buildRouteCoordinates(points)).toEqual([
      { lat: 1, lng: 1 },
      { lat: 2, lng: 2 },
      { lat: 3, lng: 3 },
    ]);
  });
});
