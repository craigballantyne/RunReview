import type { Split, TrackPoint } from "@run-review/shared";
import { describe, expect, it } from "vitest";
import { buildDistanceChannel } from "../../src/modules/analysis/distance-channel.js";
import { detectRawPointFlags } from "../../src/modules/analysis/raw-point-flags.js";

const RUN_START = new Date("2026-02-13T20:14:12.000Z");

/** A 1s-cadence track whose speed and HR at each second come from the supplied functions. */
function track(seconds: number, speedAt: (t: number) => number | null, hrAt: (t: number) => number | null = () => 150): TrackPoint[] {
  return Array.from({ length: seconds + 1 }, (_, i) => ({
    id: `tp-${i}`,
    pointIndex: i,
    elapsedSec: i,
    latitude: 55.9,
    longitude: -3.2,
    elevationM: 50,
    heartRate: hrAt(i),
    speedMps: speedAt(i),
  }));
}

function lap(splitIndex: number, offsetSec: number, durationSec: number, distanceM: number): Split {
  return {
    id: `lap-${splitIndex}`,
    splitIndex,
    startTimeGmt: new Date(RUN_START.getTime() + offsetSec * 1000).toISOString(),
    distanceM,
    durationSec,
    avgSpeedMps: distanceM / durationSec,
    avgHr: null,
    maxHr: null,
    avgCadenceSpm: null,
    elevationGainM: null,
    elevationLossM: null,
  };
}

describe("detectRawPointFlags — walk breaks", () => {
  it("finds a sustained stop mid-run", () => {
    // 60s at 1.2 m/s starting at t=300 — the shape of the 13 Feb mid-session stop.
    const points = track(1200, (t) => (t >= 300 && t < 360 ? 1.2 : 3));
    const { walkBreaks } = detectRawPointFlags(buildDistanceChannel(points, 3500), [], RUN_START);

    expect(walkBreaks).toHaveLength(1);
    expect(walkBreaks[0]!.durationSec).toBeCloseTo(60, 0);
  });

  it("reports where in the run the break happened", () => {
    const points = track(1200, (t) => (t >= 300 && t < 360 ? 1.2 : 3));
    const { walkBreaks } = detectRawPointFlags(buildDistanceChannel(points, 3528), [], RUN_START);

    // 300s at 3 m/s is about 900m in.
    expect(walkBreaks[0]!.startKm).toBeCloseTo(0.9, 1);
  });

  it("does not flag programmed recovery jogs", () => {
    // The 7 Feb recoveries run at ~2.0 m/s — slower than the reps, but still running.
    const points = track(1200, (t) => (t >= 300 && t < 390 ? 2.0 : 3));
    const { walkBreaks } = detectRawPointFlags(buildDistanceChannel(points, 3400), [], RUN_START);

    expect(walkBreaks).toEqual([]);
  });

  it("ignores a momentary dip below walking pace", () => {
    // 4 seconds — a road crossing or GPS wobble, not a walk break.
    const points = track(600, (t) => (t >= 200 && t < 204 ? 1.0 : 3));
    const { walkBreaks } = detectRawPointFlags(buildDistanceChannel(points, 1800), [], RUN_START);

    expect(walkBreaks).toEqual([]);
  });

  it("finds multiple separate breaks", () => {
    const points = track(1200, (t) => ((t >= 200 && t < 230) || (t >= 700 && t < 740) ? 1.0 : 3));
    const { walkBreaks } = detectRawPointFlags(buildDistanceChannel(points, 3400), [], RUN_START);

    expect(walkBreaks).toHaveLength(2);
  });

  it("closes a break that runs to the end of the track", () => {
    const points = track(600, (t) => (t >= 500 ? 1.0 : 3));
    const { walkBreaks } = detectRawPointFlags(buildDistanceChannel(points, 1600), [], RUN_START);

    expect(walkBreaks).toHaveLength(1);
  });

  it("treats a missing speed reading as unknown rather than stopped", () => {
    // A sensor dropout must not manufacture a walk break.
    const points = track(600, (t) => (t >= 200 && t < 260 ? null : 3));
    const { walkBreaks } = detectRawPointFlags(buildDistanceChannel(points, 1800), [], RUN_START);

    expect(walkBreaks).toEqual([]);
  });
});

describe("detectRawPointFlags — within-lap drift", () => {
  it("flags a long lap whose second half is slower", () => {
    // 600s lap: 3.2 m/s for the first half, 2.6 m/s for the second.
    const points = track(600, (t) => (t < 300 ? 3.2 : 2.6));
    const channel = buildDistanceChannel(points, 1740);
    const { withinLapDrift } = detectRawPointFlags(channel, [lap(1, 0, 600, 1740)], RUN_START);

    expect(withinLapDrift).toHaveLength(1);
    expect(withinLapDrift[0]!.paceDriftSecPerKm).toBeGreaterThan(0);
  });

  it("reports HR drift alongside pace drift", () => {
    const points = track(600, () => 3, (t) => (t < 300 ? 145 : 160));
    const channel = buildDistanceChannel(points, 1800);
    const { withinLapDrift } = detectRawPointFlags(channel, [lap(1, 0, 600, 1800)], RUN_START);

    expect(withinLapDrift[0]!.hrDriftBpm).toBeCloseTo(15, 0);
  });

  it("ignores steady long laps", () => {
    const points = track(600, () => 3);
    const channel = buildDistanceChannel(points, 1800);
    const { withinLapDrift } = detectRawPointFlags(channel, [lap(1, 0, 600, 1800)], RUN_START);

    expect(withinLapDrift).toEqual([]);
  });

  it("skips short laps, where a lap average hides nothing", () => {
    // A 90s rep is already fine-grained; internal drift is not the signal here.
    const points = track(600, (t) => (t < 45 ? 4 : 2.5));
    const channel = buildDistanceChannel(points, 1800);
    const { withinLapDrift } = detectRawPointFlags(channel, [lap(1, 0, 90, 300)], RUN_START);

    expect(withinLapDrift).toEqual([]);
  });

  it("locates laps by absolute start time, not by accumulating durations", () => {
    // A pause between laps means accumulated durations would drift out of alignment; the second
    // lap starts at t=700 despite the first lap being only 600s long.
    const points = track(1300, (t) => (t >= 700 && t < 1000 ? 3.2 : t >= 1000 ? 2.6 : 3));
    const channel = buildDistanceChannel(points, 3900);
    const { withinLapDrift } = detectRawPointFlags(channel, [lap(1, 0, 600, 1800), lap(2, 700, 600, 1740)], RUN_START);

    expect(withinLapDrift.map((d) => d.splitIndex)).toEqual([2]);
  });

  it("returns nothing when there are no splits", () => {
    const points = track(600, () => 3);
    expect(detectRawPointFlags(buildDistanceChannel(points, 1800), [], RUN_START).withinLapDrift).toEqual([]);
  });
});
