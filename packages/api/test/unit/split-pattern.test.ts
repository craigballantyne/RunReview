import type { TrackPoint } from "@run-review/shared";
import { describe, expect, it } from "vitest";
import { buildDistanceChannel } from "../../src/modules/analysis/distance-channel.js";
import { classifySplitPattern } from "../../src/modules/analysis/split-pattern.js";

/** A 2s-cadence track whose speed follows `speedAt(fraction)` across the run. */
function trackWithSpeedProfile(count: number, speedAt: (fraction: number) => number): TrackPoint[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `tp-${i}`,
    pointIndex: i,
    elapsedSec: i * 2,
    latitude: 55.9,
    longitude: -3.2,
    elevationM: 50,
    heartRate: 150,
    speedMps: speedAt(i / (count - 1)),
  }));
}

function channelFor(speedAt: (fraction: number) => number, count = 400) {
  const points = trackWithSpeedProfile(count, speedAt);
  // Total distance is irrelevant to the trend, so any consistent value works here.
  return buildDistanceChannel(points, 5000);
}

describe("classifySplitPattern", () => {
  it("reports not_applicable for a structured session", () => {
    // A regression slope through an interval session measures nothing real.
    expect(classifySplitPattern(channelFor(() => 3), "structured")).toBe("not_applicable");
  });

  it("classifies a constant-pace run as an even split", () => {
    expect(classifySplitPattern(channelFor(() => 3), "auto")).toBe("even_split");
  });

  it("classifies a run that slows throughout as a positive split", () => {
    expect(classifySplitPattern(channelFor((f) => 3.4 - 0.8 * f), "auto")).toBe("positive_split");
  });

  it("classifies a run that speeds up throughout as a negative split", () => {
    expect(classifySplitPattern(channelFor((f) => 2.6 + 0.8 * f), "auto")).toBe("negative_split");
  });

  it("keeps small drift inside the even band", () => {
    // ~1% pace drift across the run — below the 3% band, so still even.
    expect(classifySplitPattern(channelFor((f) => 3 - 0.03 * f), "auto")).toBe("even_split");
  });

  it("classifies drift beyond the band", () => {
    expect(classifySplitPattern(channelFor((f) => 3 - 0.25 * f), "auto")).toBe("positive_split");
  });

  it("returns not_applicable when there is too little track to fit", () => {
    const points = trackWithSpeedProfile(2, () => 3);
    expect(classifySplitPattern(buildDistanceChannel(points, 12), "auto")).toBe("not_applicable");
    expect(classifySplitPattern(buildDistanceChannel([], 0), "auto")).toBe("not_applicable");
  });
});
