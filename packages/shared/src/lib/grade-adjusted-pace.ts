import type { TrackPoint } from "../types/run.js";

const GRADE_CLAMP = 0.45; // Minetti et al. (2002)'s validated range (±45% grade)
const MIN_SEGMENT_DISTANCE_M = 3; // below this, GPS noise dominates the distance/elevation signal
// A window this small is prone to noisy spikes in the max-GAP stat — small windows aggregate
// only a few short (~3m+) segments, so a single GPS/elevation blip can dominate the whole
// window's gradient. 10 trades some chart resolution for materially more stable values.
const DEFAULT_WINDOW_SIZE = 10;
const EARTH_RADIUS_M = 6371000;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

function haversineDistanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/**
 * Minetti et al. (2002) energy cost of running on a gradient, in J/(kg·m). `gradeFraction` is
 * rise/run (0.1 = 10% incline, negative = decline), clamped to ±0.45 — the range actually tested
 * in the paper; the quintic term diverges hard outside it (usually GPS-noise-driven anyway).
 */
export function minettiCost(gradeFraction: number): number {
  const i = Math.max(-GRADE_CLAMP, Math.min(GRADE_CLAMP, gradeFraction));
  return 155.4 * i ** 5 - 30.4 * i ** 4 - 43.3 * i ** 3 + 46.3 * i ** 2 + 19.5 * i + 3.6;
}

const FLAT_COST = minettiCost(0);

export interface RunningSegment {
  distanceM: number;
  dtSec: number;
  /**
   * The flat-ground distance that would take the same time at the same effort (metabolic power).
   * distanceM * (C(grade) / C(0)): uphill (C(grade) > C(0)) grows this beyond the actual
   * distance, downhill shrinks it — see the "equal-effort derivation" this module's plan doc
   * worked through, since getting this ratio backwards silently reverses GAP's whole meaning.
   */
  equivalentFlatDistanceM: number;
}

/**
 * Builds one segment per consecutive track-point pair — every pair, not a subsample. GAP
 * windowing later aggregates these, so an accurate per-window gradient depends on nothing being
 * skipped here. A pair is dropped if either point lacks GPS coordinates, if the apparent distance
 * is below the GPS noise floor, or if elapsed time didn't move forward.
 *
 * When elevation is missing on either endpoint, grade defaults to 0 (flat, no adjustment) rather
 * than dropping the segment — otherwise gaps in elevation data would silently remove distance and
 * time from every aggregate that consumes this list, which is a worse failure mode than just not
 * adjusting that one segment.
 */
export function buildRunningSegments(trackPoints: TrackPoint[]): RunningSegment[] {
  const sorted = [...trackPoints].sort((a, b) => a.pointIndex - b.pointIndex);
  const segments: RunningSegment[] = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    if (a.latitude === null || a.longitude === null || b.latitude === null || b.longitude === null) continue;

    const dtSec = b.elapsedSec - a.elapsedSec;
    if (dtSec <= 0) continue;

    const distanceM = haversineDistanceM(a.latitude, a.longitude, b.latitude, b.longitude);
    if (distanceM < MIN_SEGMENT_DISTANCE_M) continue;

    const gradeFraction = a.elevationM === null || b.elevationM === null ? 0 : (b.elevationM - a.elevationM) / distanceM;
    const equivalentFlatDistanceM = distanceM * (minettiCost(gradeFraction) / FLAT_COST);

    segments.push({ distanceM, dtSec, equivalentFlatDistanceM });
  }

  return segments;
}

function paceSecPerKmFromSegments(segments: RunningSegment[]): number | null {
  const totalTimeSec = segments.reduce((sum, s) => sum + s.dtSec, 0);
  const totalEquivalentFlatDistanceM = segments.reduce((sum, s) => sum + s.equivalentFlatDistanceM, 0);
  if (totalEquivalentFlatDistanceM <= 0) return null;
  return (totalTimeSec / totalEquivalentFlatDistanceM) * 1000;
}

/** Whole-run grade-adjusted average pace (sec/km), from every raw segment — null if no valid segments. */
export function calculateAverageGapPaceSecPerKm(trackPoints: TrackPoint[]): number | null {
  return paceSecPerKmFromSegments(buildRunningSegments(trackPoints));
}

export interface GapPacePoint {
  elapsedSec: number;
  paceSecPerKm: number | null;
}

/**
 * One grade-adjusted pace value per `windowSize` track points (default 10) — but each window's
 * gradient is computed from every underlying point-to-point segment inside it, not just the
 * window's first and last point, so a coarser chart resolution doesn't cost gradient accuracy.
 * The final window is kept even if shorter than `windowSize` (not dropped).
 */
export function calculateGapPaceSeries(trackPoints: TrackPoint[], windowSize = DEFAULT_WINDOW_SIZE): GapPacePoint[] {
  const sorted = [...trackPoints].sort((a, b) => a.pointIndex - b.pointIndex);
  const series: GapPacePoint[] = [];

  for (let start = 0; start < sorted.length; start += windowSize) {
    const end = Math.min(start + windowSize, sorted.length) - 1;
    if (end <= start) continue; // need at least one point-pair inside the window

    const windowSegments = buildRunningSegments(sorted.slice(start, end + 1));
    series.push({
      elapsedSec: sorted[end]!.elapsedSec,
      paceSecPerKm: paceSecPerKmFromSegments(windowSegments),
    });
  }

  return series;
}

/**
 * Fastest windowed grade-adjusted pace — deliberately reuses the same windowed series as the
 * chart rather than the raw (as short as ~3m) per-pair segments, since taking a min over
 * individual segments is far more sensitive to GPS/barometric noise than this app's existing
 * "max pace" stat (a single smoothed instantaneous speedMps reading).
 */
export function calculateMaxGapPaceSecPerKm(trackPoints: TrackPoint[], windowSize = DEFAULT_WINDOW_SIZE): number | null {
  const values = calculateGapPaceSeries(trackPoints, windowSize)
    .map((p) => p.paceSecPerKm)
    .filter((v): v is number => v !== null);
  return values.length > 0 ? Math.min(...values) : null;
}
