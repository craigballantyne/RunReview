import { describe, expect, it } from "vitest";
import type { TrackPoint } from "../types/run.js";
import {
  buildRunningSegments,
  calculateAverageGapPaceSecPerKm,
  calculateGapPaceSeries,
  calculateMaxGapPaceSecPerKm,
  minettiCost,
} from "./grade-adjusted-pace.js";

const EARTH_RADIUS_M = 6371000; // matches the module's own haversine constant, for exact test distances
const BASE_LAT = 55;
const BASE_LON = -3;

function metersToLatDegrees(distanceM: number): number {
  return (distanceM / EARTH_RADIUS_M) * (180 / Math.PI);
}

/**
 * A straight-line synthetic run along a pure latitude axis (longitude fixed), so haversine
 * distance between consecutive points is exact rather than approximate: `count` points,
 * `stepDistanceM` apart, `stepTimeSec` apart in time, elevation rising by `stepElevationM` per point.
 */
function buildSyntheticRun(count: number, stepDistanceM: number, stepTimeSec: number, stepElevationM: number): TrackPoint[] {
  const points: TrackPoint[] = [];
  for (let i = 0; i < count; i++) {
    points.push({
      id: String(i),
      pointIndex: i,
      elapsedSec: i * stepTimeSec,
      latitude: BASE_LAT + i * metersToLatDegrees(stepDistanceM),
      longitude: BASE_LON,
      elevationM: i * stepElevationM,
      heartRate: null,
      speedMps: null,
    });
  }
  return points;
}

describe("minettiCost", () => {
  it("matches the well-known flat-running baseline at 0% grade", () => {
    expect(minettiCost(0)).toBeCloseTo(3.6, 5);
  });

  it("matches published values for a 10% incline (~1.66x flat cost)", () => {
    expect(minettiCost(0.1)).toBeCloseTo(5.968, 2);
  });

  it("matches published values for a 10% decline (cheaper than flat)", () => {
    expect(minettiCost(-0.1)).toBeCloseTo(2.152, 2);
  });

  it("clamps extreme grades to the validated +/-45% range", () => {
    expect(minettiCost(0.6)).toBeCloseTo(minettiCost(0.45), 10);
    expect(minettiCost(-0.6)).toBeCloseTo(minettiCost(-0.45), 10);
  });
});

describe("buildRunningSegments", () => {
  it("returns one segment per consecutive pair for a fully valid run", () => {
    const points = buildSyntheticRun(5, 20, 5, 0);
    expect(buildRunningSegments(points)).toHaveLength(4);
  });

  it("drops a pair below the GPS noise floor", () => {
    const points = buildSyntheticRun(2, 1, 1, 0); // 1m apart, below the 3m floor
    expect(buildRunningSegments(points)).toHaveLength(0);
  });

  it("drops pairs missing latitude/longitude on either endpoint", () => {
    const points = buildSyntheticRun(3, 20, 5, 0);
    points[1]!.latitude = null;
    // both the (0,1) and (1,2) pairs are dropped since point 1 lacks coordinates
    expect(buildRunningSegments(points)).toHaveLength(0);
  });

  it("falls back to a flat (0%) grade when elevation is missing on either endpoint, rather than dropping the segment", () => {
    const points = buildSyntheticRun(2, 20, 5, 10); // would be a steep grade if elevation counted
    points[1]!.elevationM = null;
    const segments = buildRunningSegments(points);
    expect(segments).toHaveLength(1);
    expect(segments[0]!.equivalentFlatDistanceM).toBeCloseTo(segments[0]!.distanceM, 5); // grade treated as 0
  });

  it("returns no segments for empty or single-point input", () => {
    expect(buildRunningSegments([])).toHaveLength(0);
    expect(buildRunningSegments(buildSyntheticRun(1, 20, 5, 0))).toHaveLength(0);
  });
});

describe("calculateAverageGapPaceSecPerKm", () => {
  it("matches raw pace on a flat run (no grade adjustment)", () => {
    const points = buildSyntheticRun(10, 20, 5, 0); // 5s per 20m = 250 sec/km
    expect(calculateAverageGapPaceSecPerKm(points)).toBeCloseTo(250, 1);
  });

  it("is FASTER than raw pace on a steady uphill run (uphill effort gets credit)", () => {
    const points = buildSyntheticRun(10, 20, 5, 2); // 20m steps, 2m rise each = 10% grade
    const rawPaceSecPerKm = 250;
    const expectedGap = rawPaceSecPerKm * (minettiCost(0) / minettiCost(0.1));
    const gap = calculateAverageGapPaceSecPerKm(points);
    expect(gap).not.toBeNull();
    expect(gap!).toBeLessThan(rawPaceSecPerKm);
    expect(gap!).toBeCloseTo(expectedGap, 1);
  });

  it("is SLOWER than raw pace on a steady downhill run (easy downhill speed doesn't get full credit)", () => {
    const points = buildSyntheticRun(10, 20, 5, -2); // 10% decline
    const rawPaceSecPerKm = 250;
    const expectedGap = rawPaceSecPerKm * (minettiCost(0) / minettiCost(-0.1));
    const gap = calculateAverageGapPaceSecPerKm(points);
    expect(gap).not.toBeNull();
    expect(gap!).toBeGreaterThan(rawPaceSecPerKm);
    expect(gap!).toBeCloseTo(expectedGap, 1);
  });

  it("returns null when there are no valid segments", () => {
    expect(calculateAverageGapPaceSecPerKm([])).toBeNull();
  });
});

describe("calculateGapPaceSeries", () => {
  it("produces one point per window of windowSize track points, keeping a shorter final window", () => {
    const points = buildSyntheticRun(12, 20, 5, 0);
    const series = calculateGapPaceSeries(points, 5);
    expect(series).toHaveLength(3); // windows of 5, 5, 2
    expect(series.map((p) => p.elapsedSec)).toEqual([points[4]!.elapsedSec, points[9]!.elapsedSec, points[11]!.elapsedSec]);
  });

  it("returns an empty series for empty or single-point input", () => {
    expect(calculateGapPaceSeries([])).toHaveLength(0);
    expect(calculateGapPaceSeries(buildSyntheticRun(1, 20, 5, 0))).toHaveLength(0);
  });
});

describe("calculateMaxGapPaceSecPerKm", () => {
  /** Two flat 5-point windows at different speeds: 250 sec/km, then 100 sec/km. */
  function buildTwoSpeedRun(): TrackPoint[] {
    const points = buildSyntheticRun(5, 20, 5, 0); // window A: 5s/20m = 250 sec/km
    const last = points[4]!;
    for (let i = 1; i <= 5; i++) {
      points.push({
        id: `b${i}`,
        pointIndex: 4 + i,
        elapsedSec: last.elapsedSec + i * 2, // window B: 2s/20m = 100 sec/km
        latitude: last.latitude! + i * metersToLatDegrees(20),
        longitude: BASE_LON,
        elevationM: 0,
        heartRate: null,
        speedMps: null,
      });
    }
    return points;
  }

  it("picks the fastest windowed GAP pace, not a plain average across the whole run", () => {
    const points = buildTwoSpeedRun();
    const max = calculateMaxGapPaceSecPerKm(points, 5);
    expect(max).not.toBeNull();
    expect(max!).toBeCloseTo(100, 1); // window B's pace, not blended with window A's 250
  });

  it("returns null when there are no valid windows", () => {
    expect(calculateMaxGapPaceSecPerKm([])).toBeNull();
  });
});
