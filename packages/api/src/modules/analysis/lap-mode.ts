import type { LapMode, LapModeSource, Split } from "@run-review/shared";
import { mean, median, pearson } from "./stats.js";

/** Garmin auto-lap distance. Tolerance covers float representation, not genuine variation. */
const AUTO_LAP_DISTANCE_M = 1000;
const AUTO_LAP_TOLERANCE_M = 0.5;

/**
 * Minimum laps (excluding the trailing remainder) before pace alternation means anything. Below
 * four there aren't enough transitions to distinguish alternation from noise.
 */
const MIN_LAPS_FOR_PACE_FALLBACK = 4;

/**
 * Median absolute successive lap-pace change above which an all-1km run reads as programmed reps.
 *
 * Calibrated against real runs: the reference 10k easy run's successive changes are −5.2%, +8.3%,
 * −3.2%, +2.6%, +1.9%, +2.3%, −3.6%, +1.2%, +1.5% (median absolute 2.6%, max 8.3%), while the
 * 13 Feb rep segments swing around 20%. 15% sits with clear daylight either side. Revisit if a
 * genuine easy run ever trips the fallback.
 */
const PACE_ALTERNATION_THRESHOLD = 0.15;

/**
 * Above this correlation between lap pace and lap elevation gain, the swing is terrain, not reps.
 * A hilly continuous run alternates pace too, and reading it as intervals is a worse error than
 * leaving it `auto`.
 */
const TERRAIN_CORRELATION_THRESHOLD = 0.6;

/**
 * How much higher the fast laps' average HR must be than the slow laps' before a pace swing counts
 * as programmed reps.
 *
 * Pace alternation alone is not enough. A real run caught by an earlier version of this rule swung
 * from 5:52 to 7:47/km across five 1km laps while HR stayed at 157–159 — an interrupted easy run
 * (lights, a walked hill), not a rep session, which would have shown HR cycling with the pace. The
 * separation there was 8.5 bpm against 34 bpm for a genuine 1km rep session.
 *
 * This check is only trustworthy because the fallback applies exclusively to 1km segments, which
 * are long enough for HR to fully respond; it would be far weaker on 300m reps.
 */
const MIN_REP_HR_SEPARATION_BPM = 10;

export interface LapModeResult {
  lapMode: LapMode;
  /** Null when the run is `auto` — nothing fired, so there is no source to attribute. */
  lapModeSource: LapModeSource | null;
}

/**
 * Laps excluding the trailing remainder. Every run ends on a partial lap (67.3m, 49.7m, 291.7m in
 * the reference runs), which would otherwise fail the all-1000m test on every single run.
 */
function lapsWithoutRemainder(splits: Split[]): Split[] {
  const ordered = [...splits].sort((a, b) => a.splitIndex - b.splitIndex);
  return ordered.slice(0, -1);
}

/**
 * Stage 2 of lap-mode detection: catch sessions programmed entirely in 1km segments (5×1km hard
 * with 1km jog recovery, say), which are indistinguishable from auto-splits by length alone.
 *
 * Only reached for runs stage 1 called `auto`, which means every lap here is 1000m — so raw
 * `elevationGainM` is directly comparable across laps without normalising by distance.
 */
function hasProgrammedPaceAlternation(laps: Split[]): boolean {
  if (laps.length < MIN_LAPS_FOR_PACE_FALLBACK) return false;

  const paces = laps.map((l) => l.durationSec / (l.distanceM / 1000));
  if (paces.some((p) => !Number.isFinite(p) || p <= 0)) return false;

  const changes: number[] = [];
  for (let i = 0; i < paces.length - 1; i++) {
    changes.push((paces[i + 1]! - paces[i]!) / paces[i]!);
  }

  if (median(changes.map(Math.abs)) <= PACE_ALTERNATION_THRESHOLD) return false;

  // Alternation is what separates reps from a progression run — both swing, but a progression
  // drifts monotonically while reps oscillate.
  let alternations = 0;
  for (let i = 0; i < changes.length - 1; i++) {
    if (Math.sign(changes[i]!) !== Math.sign(changes[i + 1]!)) alternations++;
  }
  if (alternations <= (changes.length - 1) / 2) return false;

  // Terrain guard. Shares its shape with `even_effort_despite_terrain` — both separate
  // terrain-driven pace variance from effort-driven variance.
  const gains = laps.map((l) => l.elevationGainM);
  if (gains.every((g) => g !== null)) {
    if (pearson(paces, gains as number[]) > TERRAIN_CORRELATION_THRESHOLD) return false;
  }

  return hasRepHeartRateSignature(laps, paces);
}

/**
 * Confirms that the faster laps were actually run harder, rather than the slower laps simply being
 * interruptions.
 *
 * Conservative when HR is missing: without it there is no way to tell a rep session from a
 * stop-start one, and this fallback is already the weaker of the two detection signals, so it
 * declines rather than guessing.
 */
function hasRepHeartRateSignature(laps: Split[], paces: number[]): boolean {
  const medianPace = median(paces);
  const fast: number[] = [];
  const slow: number[] = [];

  for (let i = 0; i < laps.length; i++) {
    const hr = laps[i]!.avgHr;
    if (hr === null) return false;
    (paces[i]! < medianPace ? fast : slow).push(hr);
  }
  if (fast.length === 0 || slow.length === 0) return false;

  return mean(fast) - mean(slow) >= MIN_REP_HR_SEPARATION_BPM;
}

/**
 * Classifies a run's splits as device auto-splits or athlete-programmed laps.
 *
 * The spec's original variance test doesn't work: structured sessions routinely *contain* 1000m
 * laps (the 7 Feb reference session is seven 1000m laps interleaved with 245.8m/185m/175.8m/500m
 * recoveries), so uniformity is ambiguous. Instead, any non-remainder lap that isn't exactly
 * 1000m proves the athlete programmed the structure.
 */
export function detectLapMode(splits: Split[]): LapModeResult {
  const laps = lapsWithoutRemainder(splits);
  if (laps.length === 0) return { lapMode: "auto", lapModeSource: null };

  const hasNonAutoLap = laps.some((l) => Math.abs(l.distanceM - AUTO_LAP_DISTANCE_M) > AUTO_LAP_TOLERANCE_M);
  if (hasNonAutoLap) return { lapMode: "structured", lapModeSource: "lap_length" };

  if (hasProgrammedPaceAlternation(laps)) {
    return { lapMode: "structured", lapModeSource: "pace_alternation" };
  }

  return { lapMode: "auto", lapModeSource: null };
}
