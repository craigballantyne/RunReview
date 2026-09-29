import type { TrackPoint } from "@run-review/shared";
import { describe, expect, it } from "vitest";
import { STANDARD_DISTANCES, STANDARD_DISTANCES_M } from "@run-review/shared";
import { detectBestEfforts, markPersonalRecords } from "../../src/modules/analysis/best-efforts.js";
import { buildDistanceChannel } from "../../src/modules/analysis/distance-channel.js";

/** A 1s-cadence track whose speed at each second comes from `speedAt`. */
function track(seconds: number, speedAt: (t: number) => number): TrackPoint[] {
  return Array.from({ length: seconds + 1 }, (_, i) => ({
    id: `tp-${i}`,
    pointIndex: i,
    elapsedSec: i,
    latitude: 55.9,
    longitude: -3.2,
    elevationM: 50,
    heartRate: 150,
    speedMps: speedAt(i),
  }));
}

function channelAtConstantSpeed(seconds: number, speedMps: number) {
  return buildDistanceChannel(track(seconds, () => speedMps), seconds * speedMps);
}

describe("detectBestEfforts", () => {
  it("finds only the distances the run actually covers", () => {
    // 3000m run: the 1k and the mile fit, nothing longer does.
    const efforts = detectBestEfforts(channelAtConstantSpeed(1000, 3));
    expect(efforts.map((e) => e.distanceM)).toEqual([1000, 1609, 2000]);
  });

  it("measures a constant-pace effort accurately", () => {
    // 3 m/s for 2000s = 6km. A 5k at 3 m/s takes 1666.7s.
    const effort = detectBestEfforts(channelAtConstantSpeed(2000, 3)).find((e) => e.distanceM === 5000);
    expect(effort!.durationSec).toBeCloseTo(5000 / 3, 1);
  });

  it("finds a fast segment embedded inside a slower run", () => {
    // 10km run, mostly at 3 m/s, with a hard 1km surge at 5 m/s starting around 400s.
    const points = track(3400, (t) => (t >= 400 && t < 600 ? 5 : 3));
    const channel = buildDistanceChannel(points, 10600);

    const km = detectBestEfforts(channel).find((e) => e.distanceM === 1000);
    // The surge covers 1000m in 200s; a steady kilometre would take 333s.
    expect(km!.durationSec).toBeLessThan(220);
    expect(km!.startOffsetM).toBeGreaterThan(1000);
  });

  it("reports where in the run the effort started", () => {
    const points = track(3400, (t) => (t >= 400 && t < 600 ? 5 : 3));
    const channel = buildDistanceChannel(points, 10600);
    const km = detectBestEfforts(channel).find((e) => e.distanceM === 1000)!;

    // The surge begins at 400s of 3 m/s running, i.e. about 1200m in.
    expect(km.startOffsetM).toBeCloseTo(1200, -2);
  });

  it("returns nothing when the channel was estimated from elapsed time", () => {
    // With distance interpolated from time, every window of a given distance takes the same
    // duration and "fastest" would be an artefact.
    const noSpeed = track(2000, () => 0).map((p) => ({ ...p, speedMps: null }));
    const channel = buildDistanceChannel(noSpeed, 6000);

    expect(channel.estimatedFromTime).toBe(true);
    expect(detectBestEfforts(channel)).toEqual([]);
  });

  it("returns nothing for a run shorter than the shortest standard distance", () => {
    expect(detectBestEfforts(channelAtConstantSpeed(100, 3))).toEqual([]);
  });

  it("handles a degenerate channel", () => {
    expect(detectBestEfforts(buildDistanceChannel([], 0))).toEqual([]);
  });

  it("searches the full standard-distance ladder, ascending", () => {
    expect([...STANDARD_DISTANCES_M]).toEqual([...STANDARD_DISTANCES_M].sort((a, b) => a - b));
    expect(STANDARD_DISTANCES_M).toContain(1000);
    expect(STANDARD_DISTANCES_M).toContain(16093); // 10 miles
    expect(STANDARD_DISTANCES_M).toContain(42195); // marathon
  });

  it("labels every distance it searches", () => {
    // The UI renders these, so a distance with no label would surface as raw metres.
    expect(STANDARD_DISTANCES.every((d) => d.label.length > 0)).toBe(true);
    expect(STANDARD_DISTANCES).toHaveLength(STANDARD_DISTANCES_M.length);
  });
});

describe("markPersonalRecords", () => {
  const efforts = [
    { distanceM: 1000, durationSec: 240, startOffsetM: 0 },
    { distanceM: 5000, durationSec: 1300, startOffsetM: 0 },
  ];

  it("marks an effort as a PR when nothing preceded it", () => {
    const marked = markPersonalRecords(efforts, new Map());
    expect(marked.every((e) => e.isPr)).toBe(true);
  });

  it("marks an effort as a PR only when it beats prior history", () => {
    const previous = new Map([
      [1000, 250],
      [5000, 1250],
    ]);
    const marked = markPersonalRecords(efforts, previous);

    expect(marked.find((e) => e.distanceM === 1000)!.isPr).toBe(true);
    expect(marked.find((e) => e.distanceM === 5000)!.isPr).toBe(false);
  });

  it("does not treat an equal time as a new PR", () => {
    const marked = markPersonalRecords(efforts, new Map([[1000, 240]]));
    expect(marked.find((e) => e.distanceM === 1000)!.isPr).toBe(false);
  });

  it("preserves the effort payload alongside the flag", () => {
    const marked = markPersonalRecords(efforts, new Map());
    expect(marked[0]).toEqual({ distanceM: 1000, durationSec: 240, startOffsetM: 0, isPr: true });
  });
});
