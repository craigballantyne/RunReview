import { describe, expect, it } from "vitest";
import type { TrackPoint } from "@run-review/shared";
import { buildGradientSegments } from "./route-gradient.js";

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

describe("buildGradientSegments", () => {
  it("returns one segment per consecutive pair of valid points", () => {
    const points = [
      point({ pointIndex: 0, latitude: 1, longitude: 1, speedMps: 3 }),
      point({ pointIndex: 1, latitude: 2, longitude: 2, speedMps: 4 }),
      point({ pointIndex: 2, latitude: 3, longitude: 3, speedMps: 5 }),
    ];
    expect(buildGradientSegments(points, "pace")).toHaveLength(2);
  });

  it("returns an empty array with fewer than 2 usable points", () => {
    expect(buildGradientSegments([point({ latitude: 1, longitude: 1, speedMps: 3 })], "pace")).toEqual([]);
    expect(buildGradientSegments([], "pace")).toEqual([]);
  });

  it("drops points missing position or the target metric, leaving a gap rather than a wrong color", () => {
    const points = [
      point({ pointIndex: 0, latitude: 1, longitude: 1, heartRate: 120 }),
      point({ pointIndex: 1, latitude: null, longitude: null, heartRate: 130 }), // no position
      point({ pointIndex: 2, latitude: 2, longitude: 2, heartRate: null }), // no HR
      point({ pointIndex: 3, latitude: 3, longitude: 3, heartRate: 140 }),
    ];
    // Only points 0 and 3 have both a position and an HR value -> exactly one segment between them.
    const segments = buildGradientSegments(points, "heartRate");
    expect(segments).toHaveLength(1);
    expect(segments[0]?.positions).toEqual([
      [1, 1],
      [3, 3],
    ]);
  });

  it("pace: the fastest segment is lighter than the slowest segment", () => {
    const points = [
      point({ pointIndex: 0, latitude: 1, longitude: 1, speedMps: 1 }), // slow
      point({ pointIndex: 1, latitude: 2, longitude: 2, speedMps: 1 }), // slow -> slow segment
      point({ pointIndex: 2, latitude: 3, longitude: 3, speedMps: 5 }), // fast
      point({ pointIndex: 3, latitude: 4, longitude: 4, speedMps: 5 }), // fast -> fast segment
    ];
    const [slowSegment, , fastSegment] = buildGradientSegments(points, "pace");
    // Lighter color = higher RGB channel values (closer to white).
    const slowBrightness = Number.parseInt(slowSegment!.color.slice(1), 16);
    const fastBrightness = Number.parseInt(fastSegment!.color.slice(1), 16);
    expect(fastBrightness).toBeGreaterThan(slowBrightness);
  });

  it("heart rate: the highest-HR segment is darker than the lowest-HR segment", () => {
    const points = [
      point({ pointIndex: 0, latitude: 1, longitude: 1, heartRate: 100 }),
      point({ pointIndex: 1, latitude: 2, longitude: 2, heartRate: 100 }),
      point({ pointIndex: 2, latitude: 3, longitude: 3, heartRate: 180 }),
      point({ pointIndex: 3, latitude: 4, longitude: 4, heartRate: 180 }),
    ];
    const [lowSegment, , highSegment] = buildGradientSegments(points, "heartRate");
    const lowBrightness = Number.parseInt(lowSegment!.color.slice(1), 16);
    const highBrightness = Number.parseInt(highSegment!.color.slice(1), 16);
    expect(highBrightness).toBeLessThan(lowBrightness);
  });

  it("elevation: the lowest-elevation segment is darker than the highest-elevation segment", () => {
    const points = [
      point({ pointIndex: 0, latitude: 1, longitude: 1, elevationM: 10 }),
      point({ pointIndex: 1, latitude: 2, longitude: 2, elevationM: 10 }),
      point({ pointIndex: 2, latitude: 3, longitude: 3, elevationM: 200 }),
      point({ pointIndex: 3, latitude: 4, longitude: 4, elevationM: 200 }),
    ];
    const [lowSegment, , highSegment] = buildGradientSegments(points, "elevation");
    const lowBrightness = Number.parseInt(lowSegment!.color.slice(1), 16);
    const highBrightness = Number.parseInt(highSegment!.color.slice(1), 16);
    expect(highBrightness).toBeGreaterThan(lowBrightness);
  });

  it("uses the mid-point gray when every value in the route is identical", () => {
    const points = [
      point({ pointIndex: 0, latitude: 1, longitude: 1, heartRate: 150 }),
      point({ pointIndex: 1, latitude: 2, longitude: 2, heartRate: 150 }),
    ];
    const segments = buildGradientSegments(points, "heartRate");
    expect(segments).toHaveLength(1);
    expect(segments[0]?.color).toMatch(/^#[0-9a-f]{6}$/);
  });
});
