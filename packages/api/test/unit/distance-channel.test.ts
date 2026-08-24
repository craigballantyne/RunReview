import type { TrackPoint } from "@run-review/shared";
import { describe, expect, it } from "vitest";
import { buildDistanceChannel, elapsedSecAtDistance } from "../../src/modules/analysis/distance-channel.js";

function point(pointIndex: number, elapsedSec: number, speedMps: number | null, latitude: number | null = 55.9): TrackPoint {
  return {
    id: `tp-${pointIndex}`,
    pointIndex,
    elapsedSec,
    latitude,
    longitude: latitude === null ? null : -3.2,
    elevationM: 50,
    heartRate: 150,
    speedMps,
  };
}

/** A 2s-cadence track at constant speed, matching the reference run's recording rate. */
function constantSpeedTrack(count: number, speedMps: number): TrackPoint[] {
  return Array.from({ length: count }, (_, i) => point(i, i * 2, speedMps));
}

describe("buildDistanceChannel", () => {
  it("integrates a constant-speed track linearly", () => {
    const channel = buildDistanceChannel(constantSpeedTrack(6, 3), 30);

    expect(channel.estimatedFromTime).toBe(false);
    expect(channel.cumulativeM[0]).toBe(0);
    expect(channel.cumulativeM[5]).toBeCloseTo(30, 6);
    expect(channel.cumulativeM[3]).toBeCloseTo(18, 6);
  });

  it("rescales the integrated total to the run's authoritative distance", () => {
    // Integration alone would give 30m; the device says the run was 33m.
    const channel = buildDistanceChannel(constantSpeedTrack(6, 3), 33);

    expect(channel.cumulativeM[5]).toBeCloseTo(33, 6);
    expect(channel.cumulativeM[3]).toBeCloseTo(19.8, 6);
  });

  it("produces a monotonic non-decreasing channel starting at zero", () => {
    const points = [point(0, 0, 0), point(1, 2, 4), point(2, 4, 1), point(3, 6, 5)];
    const channel = buildDistanceChannel(points, 100);

    expect(channel.cumulativeM[0]).toBe(0);
    for (let i = 1; i < channel.cumulativeM.length; i++) {
      expect(channel.cumulativeM[i]!).toBeGreaterThanOrEqual(channel.cumulativeM[i - 1]!);
    }
  });

  it("sorts by pointIndex rather than trusting array order", () => {
    const ordered = buildDistanceChannel(constantSpeedTrack(6, 3), 30);
    const shuffled = buildDistanceChannel([...constantSpeedTrack(6, 3)].reverse(), 30);

    expect(shuffled.cumulativeM).toEqual(ordered.cumulativeM);
  });

  describe("recording gaps", () => {
    it("contributes no distance across a pause", () => {
      // 2s cadence throughout, except a 120s autopause between index 2 and 3 — during which the
      // athlete was stopped, so the gap must add nothing.
      const points = [point(0, 0, 3), point(1, 2, 3), point(2, 4, 3), point(3, 124, 3), point(4, 126, 3)];
      const channel = buildDistanceChannel(points, 100);

      // Only three 2s intervals carry distance; the pause interval is skipped, so the pre- and
      // post-pause points share the same cumulative value before rescaling.
      expect(channel.cumulativeM[3]).toBeCloseTo(channel.cumulativeM[2]!, 6);
      expect(channel.cumulativeM[4]).toBeGreaterThan(channel.cumulativeM[3]!);
    });

    it("scales the gap threshold to the track's own cadence", () => {
      // A 10s-cadence track ("smart recording") must not have every interval read as a pause.
      const points = Array.from({ length: 6 }, (_, i) => point(i, i * 10, 3));
      const channel = buildDistanceChannel(points, 150);

      expect(channel.cumulativeM[5]).toBeCloseTo(150, 6);
      expect(channel.cumulativeM[1]).toBeGreaterThan(0);
    });

    it("ignores non-advancing timestamps", () => {
      const points = [point(0, 0, 3), point(1, 2, 3), point(2, 2, 3), point(3, 4, 3)];
      const channel = buildDistanceChannel(points, 12);

      expect(channel.cumulativeM[2]).toBeCloseTo(channel.cumulativeM[1]!, 6);
    });
  });

  describe("missing data", () => {
    it("falls back to the other endpoint when one speed is null", () => {
      const withNull = buildDistanceChannel([point(0, 0, 3), point(1, 2, null), point(2, 4, 3)], 12);
      const withoutNull = buildDistanceChannel([point(0, 0, 3), point(1, 2, 3), point(2, 4, 3)], 12);

      // Dropping the interval instead would silently shorten the run.
      expect(withNull.cumulativeM).toEqual(withoutNull.cumulativeM);
    });

    it("interpolates from elapsed time when no speed data exists at all", () => {
      const points = Array.from({ length: 5 }, (_, i) => point(i, i * 2, null));
      const channel = buildDistanceChannel(points, 100);

      expect(channel.estimatedFromTime).toBe(true);
      expect(channel.cumulativeM[0]).toBe(0);
      expect(channel.cumulativeM[2]).toBeCloseTo(50, 6);
      expect(channel.cumulativeM[4]).toBeCloseTo(100, 6);
    });

    it("is unaffected by null coordinates at the head of the track", () => {
      // Pre-GPS-lock points have null lat/lon; the reference run has 53 of them. Integrating
      // speed rather than haversine is what makes this a non-event.
      const points = [point(0, 0, 3, null), point(1, 2, 3, null), point(2, 4, 3), point(3, 6, 3)];
      const channel = buildDistanceChannel(points, 18);

      expect(channel.estimatedFromTime).toBe(false);
      expect(channel.cumulativeM[3]).toBeCloseTo(18, 6);
    });

    it("returns a degenerate channel for fewer than two points", () => {
      expect(buildDistanceChannel([point(0, 0, 3)], 100).cumulativeM).toEqual([0]);
      expect(buildDistanceChannel([], 100).cumulativeM).toEqual([]);
    });
  });
});

describe("elapsedSecAtDistance", () => {
  const channel = buildDistanceChannel(constantSpeedTrack(6, 3), 30);

  it("returns the elapsed time at an exact point boundary", () => {
    expect(elapsedSecAtDistance(channel, 12)).toBeCloseTo(4, 6);
  });

  it("interpolates between bracketing points", () => {
    expect(elapsedSecAtDistance(channel, 15)).toBeCloseTo(5, 6);
  });

  it("handles the channel endpoints", () => {
    expect(elapsedSecAtDistance(channel, 0)).toBeCloseTo(0, 6);
    expect(elapsedSecAtDistance(channel, 30)).toBeCloseTo(10, 6);
  });

  it("returns null outside the channel", () => {
    expect(elapsedSecAtDistance(channel, -1)).toBeNull();
    expect(elapsedSecAtDistance(channel, 31)).toBeNull();
  });
});
