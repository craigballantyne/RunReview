import type { RawPointFlags, Split, WalkBreak, WithinLapDrift } from "@run-review/shared";
import type { DistanceChannel } from "./distance-channel.js";

/**
 * Speed below which the athlete is walking or stopped rather than running.
 *
 * Separates cleanly in the reference data: programmed recovery jogs sit around 2.0 m/s
 * (8:11–8:32/km) while the genuine mid-session stop on 13 Feb drops to 1.51 m/s with HR collapsing
 * to 83. 1.5 catches real stops without flagging float segments as walk breaks.
 */
const WALK_SPEED_MPS = 1.5;

/** Below this, a dip under walking pace is a GPS wobble or a road crossing, not a walk break. */
const MIN_WALK_BREAK_SEC = 10;

/**
 * Only laps at least this long are checked for internal drift. Shorter laps are already
 * fine-grained enough that a lap average hides nothing — the point of this pass is catching drift
 * that a *long* lap's average smooths away.
 */
const MIN_LAP_SEC_FOR_DRIFT = 240;

/** Drift below these is ordinary within-lap variation, not a signal worth surfacing. */
const MIN_PACE_DRIFT_SEC_PER_KM = 10;
const MIN_HR_DRIFT_BPM = 5;

/**
 * Sustained drops below running pace, located anywhere in the track and independent of lap
 * boundaries — the sub-lap events a lap average would smooth over.
 *
 * A null speed reading neither starts nor extends a break: treating unknown as stopped would
 * manufacture walk breaks out of sensor dropouts.
 */
function detectWalkBreaks(channel: DistanceChannel): WalkBreak[] {
  const { points, cumulativeM } = channel;
  const breaks: WalkBreak[] = [];
  let startIndex: number | null = null;

  const closeBreak = (endIndex: number) => {
    if (startIndex === null) return;
    const durationSec = points[endIndex]!.elapsedSec - points[startIndex]!.elapsedSec;
    if (durationSec >= MIN_WALK_BREAK_SEC) {
      breaks.push({ startKm: cumulativeM[startIndex]! / 1000, durationSec });
    }
    startIndex = null;
  };

  for (let i = 0; i < points.length; i++) {
    const speed = points[i]!.speedMps;
    const isWalking = speed !== null && speed < WALK_SPEED_MPS;

    if (isWalking && startIndex === null) startIndex = i;
    if (!isWalking && startIndex !== null) closeBreak(i);
  }
  if (startIndex !== null) closeBreak(points.length - 1);

  return breaks;
}

interface HalfStats {
  paceSecPerKm: number | null;
  avgHr: number | null;
}

function statsForRange(channel: DistanceChannel, from: number, to: number): HalfStats {
  const { points, cumulativeM } = channel;
  if (to <= from) return { paceSecPerKm: null, avgHr: null };

  const distanceM = cumulativeM[to]! - cumulativeM[from]!;
  const elapsedSec = points[to]!.elapsedSec - points[from]!.elapsedSec;
  const paceSecPerKm = distanceM > 0 && elapsedSec > 0 ? elapsedSec / (distanceM / 1000) : null;

  const heartRates: number[] = [];
  for (let i = from; i <= to; i++) {
    const hr = points[i]!.heartRate;
    if (hr !== null) heartRates.push(hr);
  }
  const avgHr = heartRates.length > 0 ? heartRates.reduce((s, v) => s + v, 0) / heartRates.length : null;

  return { paceSecPerKm, avgHr };
}

/**
 * Pace and HR trend within individual long laps.
 *
 * Lap boundaries come from each split's absolute `startTimeGmt` rather than from accumulating lap
 * durations, which would drift out of alignment across a run containing pauses.
 *
 * Sign convention: positive pace drift means slowing, positive HR drift means rising. The pair
 * together is what matters — HR climbing while pace falls is decoupling, whereas both easing off
 * is just a deliberate wind-down.
 */
function detectWithinLapDrift(channel: DistanceChannel, splits: Split[], runStartTimeGmt: Date): WithinLapDrift[] {
  const { points } = channel;
  if (points.length < 4) return [];

  const runStartMs = runStartTimeGmt.getTime();
  const drifts: WithinLapDrift[] = [];

  for (const split of splits) {
    if (split.durationSec < MIN_LAP_SEC_FOR_DRIFT) continue;

    const lapStartMs = new Date(split.startTimeGmt).getTime();
    if (Number.isNaN(lapStartMs)) continue;

    const startSec = (lapStartMs - runStartMs) / 1000;
    const endSec = startSec + split.durationSec;
    const midSec = startSec + split.durationSec / 2;

    const from = points.findIndex((p) => p.elapsedSec >= startSec);
    const mid = points.findIndex((p) => p.elapsedSec >= midSec);
    let to = points.findIndex((p) => p.elapsedSec >= endSec);
    if (to === -1) to = points.length - 1;
    if (from === -1 || mid === -1 || from >= mid || mid >= to) continue;

    const first = statsForRange(channel, from, mid);
    const second = statsForRange(channel, mid, to);
    if (first.paceSecPerKm === null || second.paceSecPerKm === null) continue;

    const paceDriftSecPerKm = second.paceSecPerKm - first.paceSecPerKm;
    const hrDriftBpm = first.avgHr !== null && second.avgHr !== null ? second.avgHr - first.avgHr : null;

    const paceIsNotable = Math.abs(paceDriftSecPerKm) >= MIN_PACE_DRIFT_SEC_PER_KM;
    const hrIsNotable = hrDriftBpm !== null && Math.abs(hrDriftBpm) >= MIN_HR_DRIFT_BPM;
    if (!paceIsNotable && !hrIsNotable) continue;

    drifts.push({ splitIndex: split.splitIndex, hrDriftBpm, paceDriftSecPerKm });
  }

  return drifts;
}

export function detectRawPointFlags(
  channel: DistanceChannel,
  splits: Split[],
  runStartTimeGmt: Date,
): RawPointFlags {
  return {
    walkBreaks: detectWalkBreaks(channel),
    withinLapDrift: detectWithinLapDrift(channel, [...splits].sort((a, b) => a.splitIndex - b.splitIndex), runStartTimeGmt),
  };
}
