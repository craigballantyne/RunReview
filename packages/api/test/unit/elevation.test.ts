import type { TrackPoint } from "@run-review/shared";
import { describe, expect, it } from "vitest";
import { classifyElevationBucket, computeElevationGainM } from "../../src/modules/analysis/elevation.js";

function track(elevations: (number | null)[]): TrackPoint[] {
  return elevations.map((elevationM, i) => ({
    id: `tp-${i}`,
    pointIndex: i,
    elapsedSec: i * 2,
    latitude: 55.9,
    longitude: -3.2,
    elevationM,
    heartRate: 150,
    speedMps: 3,
  }));
}

describe("computeElevationGainM", () => {
  it("returns near-zero gain for genuinely flat ground", () => {
    expect(computeElevationGainM(track(Array(100).fill(50)))!).toBeCloseTo(0, 6);
  });

  it("does not accumulate barometric noise into phantom climb", () => {
    // ±1m jitter around a flat baseline for 200 points. Summing raw positive deltas would report
    // roughly 100m of ascent here; the hysteresis threshold must report essentially none.
    const noisy = Array.from({ length: 200 }, (_, i) => 50 + (i % 2 === 0 ? 1 : -1));
    expect(computeElevationGainM(track(noisy))!).toBeLessThan(2);
  });

  it("measures a sustained climb", () => {
    // 100 points rising 1m each: 99m of real ascent.
    const climb = Array.from({ length: 100 }, (_, i) => 50 + i);
    expect(computeElevationGainM(track(climb))!).toBeGreaterThan(90);
    expect(computeElevationGainM(track(climb))!).toBeLessThanOrEqual(100);
  });

  it("counts only ascent, not descent", () => {
    const upThenDown = [...Array.from({ length: 50 }, (_, i) => 50 + i), ...Array.from({ length: 50 }, (_, i) => 99 - i)];
    const gain = computeElevationGainM(track(upThenDown))!;
    expect(gain).toBeGreaterThan(40);
    expect(gain).toBeLessThan(60);
  });

  it("counts repeated rollers rather than only net change", () => {
    // Five 20m hills that return to the start: net zero, but 100m of climbing.
    const rollers: number[] = [];
    for (let hill = 0; hill < 5; hill++) {
      for (let i = 0; i < 20; i++) rollers.push(50 + i);
      for (let i = 0; i < 20; i++) rollers.push(69 - i);
    }
    expect(computeElevationGainM(track(rollers))!).toBeGreaterThan(80);
  });

  it("ignores points with no elevation reading", () => {
    expect(computeElevationGainM(track([50, null, 50, null, 50]))!).toBeCloseTo(0, 6);
  });

  it("returns null when there is nothing to measure", () => {
    expect(computeElevationGainM(track([]))).toBeNull();
    expect(computeElevationGainM(track([50]))).toBeNull();
    expect(computeElevationGainM(track([null, null]))).toBeNull();
  });
});

describe("classifyElevationBucket", () => {
  it("classifies the reference run's terrain as flat", () => {
    // 40.15m over 10.07km = 4.0 m/km.
    expect(classifyElevationBucket(40.15, 10070)).toBe("flat");
  });

  it("normalises by distance so the same climb scales with run length", () => {
    expect(classifyElevationBucket(200, 5000)).toBe("hilly"); // 40 m/km
    expect(classifyElevationBucket(200, 42195)).toBe("flat"); // 4.7 m/km
  });

  it("places the bucket boundaries at 10 and 25 m/km", () => {
    expect(classifyElevationBucket(99, 10000)).toBe("flat");
    expect(classifyElevationBucket(100, 10000)).toBe("rolling");
    expect(classifyElevationBucket(250, 10000)).toBe("rolling");
    expect(classifyElevationBucket(251, 10000)).toBe("hilly");
  });

  it("returns null without usable inputs", () => {
    expect(classifyElevationBucket(null, 10000)).toBeNull();
    expect(classifyElevationBucket(100, 0)).toBeNull();
  });
});
