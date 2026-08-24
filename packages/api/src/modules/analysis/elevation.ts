import type { ElevationBucket, TrackPoint } from "@run-review/shared";

/**
 * Rolling-mean window over the elevation channel, in points. At the reference tracks' 2s cadence
 * this is a 10-second smoothing window — long enough to flatten barometric jitter, short enough
 * to preserve a real 20-second climb.
 */
const SMOOTHING_WINDOW = 5;

/**
 * Minimum sustained rise before it counts as climbing. Barometric altimeters drift by a metre or
 * two continuously; summing raw positive deltas would turn that drift into hundreds of phantom
 * metres over an hour.
 */
const MIN_CLIMB_M = 2;

/** Gain per km. Fixed absolutes rather than athlete-relative percentiles — see the spec. */
const FLAT_CEILING_M_PER_KM = 10;
const ROLLING_CEILING_M_PER_KM = 25;

function smooth(values: number[], window: number): number[] {
  if (values.length <= window) return [...values];
  const half = Math.floor(window / 2);
  return values.map((_, i) => {
    const lo = Math.max(0, i - half);
    const hi = Math.min(values.length - 1, i + half);
    let sum = 0;
    for (let j = lo; j <= hi; j++) sum += values[j]!;
    return sum / (hi - lo + 1);
  });
}

/**
 * Total ascent from the smoothed elevation channel, using a hysteresis threshold: the reference
 * altitude only moves once the track has risen or fallen by `MIN_CLIMB_M`, so noise below that
 * amplitude never accumulates.
 *
 * Deliberately recomputed rather than read from the device's `elevationGainM`, which varies in
 * methodology between devices and firmware versions.
 */
export function computeElevationGainM(trackPoints: TrackPoint[]): number | null {
  const elevations = [...trackPoints]
    .sort((a, b) => a.pointIndex - b.pointIndex)
    .map((p) => p.elevationM)
    .filter((e): e is number => e !== null);

  if (elevations.length < 2) return null;

  const smoothed = smooth(elevations, SMOOTHING_WINDOW);
  let reference = smoothed[0]!;
  let gain = 0;

  for (const elevation of smoothed) {
    const delta = elevation - reference;
    if (delta >= MIN_CLIMB_M) {
      gain += delta;
      reference = elevation;
    } else if (delta <= -MIN_CLIMB_M) {
      reference = elevation;
    }
  }

  return gain;
}

/**
 * Buckets a run by elevation gain per kilometre.
 *
 * Normalising by distance is what makes this comparable across runs — 200m of climb is a hilly 5k
 * and an unremarkable marathon.
 */
export function classifyElevationBucket(gainM: number | null, distanceM: number): ElevationBucket | null {
  if (gainM === null || distanceM <= 0) return null;
  const perKm = gainM / (distanceM / 1000);
  if (perKm < FLAT_CEILING_M_PER_KM) return "flat";
  if (perKm <= ROLLING_CEILING_M_PER_KM) return "rolling";
  return "hilly";
}
