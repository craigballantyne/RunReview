import type { TrackPoint } from "@run-review/shared";
import { median } from "./stats.js";

/**
 * Below this many points there's nothing to integrate — callers get a degenerate channel and
 * should skip any distance-keyed field rather than trusting a two-element array.
 */
const MIN_POINTS = 2;

/**
 * A recording gap is any `dt` well above the track's own cadence. Scaled off the median rather
 * than fixed, because recording rate varies by device and mode (2s on the reference tracks, but
 * "smart recording" can stretch to 10s+ on steady sections, which must not read as a pause).
 */
const GAP_DT_MULTIPLE = 5;
const GAP_DT_FLOOR_SEC = 10;

export interface DistanceChannel {
  /** Track points sorted by `pointIndex`; `cumulativeM[i]` is the distance at `points[i]`. */
  points: TrackPoint[];
  /** Cumulative metres from the start. Monotonic non-decreasing, starts at 0. */
  cumulativeM: number[];
  /**
   * True when no usable `speedMps` data existed and distance was interpolated from elapsed time
   * instead. Exact for a constant-pace run, progressively wrong as pace varies — consumers that
   * care about *where* in the run something happened (walk breaks, best efforts) should treat
   * results from an estimated channel as low confidence.
   */
  estimatedFromTime: boolean;
}

/**
 * Builds cumulative distance for a run's track. `TrackPoint` carries `elapsedSec` and `speedMps`
 * but no distance channel, and four Layer 1 fields need one (split-pattern regression, walk-break
 * positions, best-effort windows, elevation per km).
 *
 * Trapezoidal integration of `speedMps` over `dt`, then rescaled so the total matches the run's
 * own `distanceM`. Deliberately *not* GPS haversine, which `grade-adjusted-pace.ts` uses for its
 * own purposes: haversine is unusable at the head of a track where pre-GPS-lock points have null
 * coordinates (53 such points in the reference run), and its per-pair noise inflates totals.
 * Integrating a device-smoothed speed channel and pinning the total to the device's own distance
 * avoids both problems.
 */
export function buildDistanceChannel(trackPoints: TrackPoint[], totalDistanceM: number): DistanceChannel {
  const points = [...trackPoints].sort((a, b) => a.pointIndex - b.pointIndex);
  if (points.length < MIN_POINTS) {
    return { points, cumulativeM: points.map(() => 0), estimatedFromTime: false };
  }

  const deltas: number[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    deltas.push(points[i + 1]!.elapsedSec - points[i]!.elapsedSec);
  }
  const gapThresholdSec = Math.max(GAP_DT_FLOOR_SEC, median(deltas.filter((d) => d > 0)) * GAP_DT_MULTIPLE);

  const raw: number[] = [0];
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const dt = deltas[i]!;

    // A gap contributes nothing. Autopause is the common cause and no distance was covered during
    // it, so zero is correct. A mid-run recording dropout while still moving would be undercounted
    // here, but the rescale below redistributes that across the rest of the track — locally wrong,
    // globally right, which is the better failure mode for every consumer of this channel.
    if (dt <= 0 || dt > gapThresholdSec) {
      raw.push(total);
      continue;
    }

    // A null speed on one endpoint falls back to the other rather than dropping the interval,
    // which would silently shorten the run.
    const speedA = a.speedMps ?? b.speedMps ?? 0;
    const speedB = b.speedMps ?? a.speedMps ?? 0;
    total += ((speedA + speedB) / 2) * dt;
    raw.push(total);
  }

  // No usable speed channel at all. Fall back to distributing the run's distance across elapsed
  // time — exact at constant pace, and strictly better than returning nothing when four downstream
  // fields would otherwise be unavailable.
  if (total <= 0) {
    const elapsedTotal = points[points.length - 1]!.elapsedSec - points[0]!.elapsedSec;
    if (elapsedTotal <= 0) {
      return { points, cumulativeM: points.map(() => 0), estimatedFromTime: true };
    }
    const startSec = points[0]!.elapsedSec;
    return {
      points,
      cumulativeM: points.map((p) => ((p.elapsedSec - startSec) / elapsedTotal) * totalDistanceM),
      estimatedFromTime: true,
    };
  }

  // Pin the integrated total to the device's authoritative distance. Integration drift over
  // thousands of intervals is small but systematic, and every distance-keyed field downstream
  // reads better against a channel that agrees with the run's headline distance.
  const scale = totalDistanceM > 0 ? totalDistanceM / total : 1;
  return { points, cumulativeM: raw.map((m) => m * scale), estimatedFromTime: false };
}

/**
 * Elapsed seconds at a given distance, linearly interpolated between the bracketing track points.
 * Returns null when the distance falls outside the channel.
 */
export function elapsedSecAtDistance(channel: DistanceChannel, distanceM: number): number | null {
  const { points, cumulativeM } = channel;
  if (points.length < MIN_POINTS) return null;
  if (distanceM < 0 || distanceM > cumulativeM[cumulativeM.length - 1]!) return null;

  for (let i = 0; i < cumulativeM.length - 1; i++) {
    const lo = cumulativeM[i]!;
    const hi = cumulativeM[i + 1]!;
    if (distanceM > hi) continue;
    if (hi === lo) return points[i]!.elapsedSec;
    const fraction = (distanceM - lo) / (hi - lo);
    return points[i]!.elapsedSec + fraction * (points[i + 1]!.elapsedSec - points[i]!.elapsedSec);
  }
  return points[points.length - 1]!.elapsedSec;
}
