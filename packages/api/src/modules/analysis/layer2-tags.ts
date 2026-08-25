import type {
  EffortPaceMismatch,
  Layer2Evidence,
  Layer2Tags,
  RawPointFlags,
  SegmentClassification,
  Split,
  WorkoutStructure,
} from "@run-review/shared";
import { coefficientOfVariation, linearSlope, mean, median, pearson } from "./stats.js";

/** Reps below this count are a hard effort inside another run, not an interval session. */
const MIN_REPS_FOR_INTERVALS = 2;

/**
 * Share of gaps between consecutive reps that must contain a float or recovery before the session
 * reads as structured intervals rather than scattered surges.
 */
const MIN_ALTERNATION_RATIO = 0.6;

/** Lap-pace spread below which a run is holding one pace rather than varying deliberately. */
const STEADY_PACE_CV = 0.06;

/** A progression needs both a real speed-up and a tight fit — a noisy downward drift is not one. */
const PROGRESSION_MIN_CORRELATION = 0.7;
const PROGRESSION_MIN_DRIFT_SEC_PER_KM = 8;

/** How much slower the closing portion must run before it counts as a fade. */
const FADE_THRESHOLD = 0.05;

/**
 * How much faster than the run's median a segment must be to read as a surge.
 *
 * Calibrated against 332 real runs: 8% fires on 20% of them, which is ordinary pace variation
 * rather than a surge. 12% fires on 11% — an exception rate that matches what the tag is for.
 */
const SURGE_THRESHOLD = 0.12;

/**
 * Efficiency decoupling — the fractional drop in speed-per-heartbeat from the first portion of the
 * run to the last — beyond which HR and pace count as having come apart.
 *
 * Deliberately not the textbook 5%, which comes from steady-state aerobic testing and fires on 54%
 * of these runs: measured across whole runs of mixed effort, ordinary drift sits at a median of
 * 5.4%. 15% is roughly three times typical and lands at the 90th percentile, firing on 11%.
 */
const MISMATCH_DECOUPLING = 0.15;

/** Fewest comparable segments before a within-run trend means anything. */
const MIN_SEGMENTS_FOR_TREND = 4;

/** Even effort means pace tracked the hills while HR barely moved. */
const TERRAIN_PACE_CORRELATION = 0.5;
const EVEN_EFFORT_MAX_HR_CV = 0.05;

/**
 * A single stop is not a pattern.
 *
 * Layer 1 records any stop over 10 seconds, which is right for evidence but far too loose for a
 * tag — 61% of real runs contain one, because urban running means crossings and lights rather than
 * a training behaviour worth reporting. Requiring repetition brings it to 16%.
 */
const WALK_PATTERN_MIN_BREAKS = 2;
const WALK_PATTERN_MIN_BREAK_SEC = 30;
/** One very long stop stands on its own, without needing a second. */
const WALK_PATTERN_SINGLE_BREAK_SEC = 120;

function hasWalkBreakPattern(flags: RawPointFlags): boolean {
  const sustained = flags.walkBreaks.filter((b) => b.durationSec >= WALK_PATTERN_MIN_BREAK_SEC);
  return (
    sustained.length >= WALK_PATTERN_MIN_BREAKS ||
    flags.walkBreaks.some((b) => b.durationSec >= WALK_PATTERN_SINGLE_BREAK_SEC)
  );
}

export interface Layer2TagInput {
  segments: SegmentClassification[];
  /** Needed for per-lap elevation, which `SegmentClassification` deliberately doesn't carry. */
  splits: Split[];
  rawPointFlags: RawPointFlags;
}

/** Segments that represent the run's actual work, with warmup and cooldown stripped off. */
function bodySegments(segments: SegmentClassification[]): SegmentClassification[] {
  const body = segments.filter((s) => s.role !== "warmup" && s.role !== "cooldown");
  // A run that is *entirely* warmup and cooldown has no body to speak of; fall back to everything
  // rather than returning an empty set that would silently disable every flag below.
  return body.length > 0 ? body : segments;
}

/**
 * Splits a run into an earlier and a closing portion of *comparable* segments.
 *
 * On a session with reps, only reps are compared. The body of an interval session alternates hard
 * and easy segments, so the average pace of an arbitrary slice reflects how many recoveries
 * happened to fall inside it rather than how fast the athlete was running — the 7 Feb session
 * reads as a 26% slowdown on a naive split purely because its closing slice contains two
 * recoveries against the opening slice's one. Comparing reps to reps removes that artefact.
 *
 * Portions are summarised by median rather than mean, so a single outlier rep (13 Feb has one at
 * 3:50/km against a session norm of 4:35) doesn't manufacture a trend.
 */
function comparablePortions(
  segments: SegmentClassification[],
  closingFraction: number,
): { earlier: SegmentClassification[]; closing: SegmentClassification[] } | null {
  const reps = segments.filter((s) => s.role === "rep" && Number.isFinite(s.paceSecPerKm));
  const pool =
    reps.length >= MIN_SEGMENTS_FOR_TREND
      ? reps
      : bodySegments(segments).filter((s) => Number.isFinite(s.paceSecPerKm));

  if (pool.length < MIN_SEGMENTS_FOR_TREND) return null;

  const at = Math.max(1, Math.floor(pool.length * closingFraction));
  const earlier = pool.slice(0, at);
  const closing = pool.slice(at);
  return earlier.length > 0 && closing.length > 0 ? { earlier, closing } : null;
}

function isProgression(segments: SegmentClassification[]): boolean {
  const body = bodySegments(segments).filter((s) => Number.isFinite(s.paceSecPerKm));
  if (body.length < 4) return false;

  const indices = body.map((_, i) => i);
  const paces = body.map((s) => s.paceSecPerKm);

  // Negative slope means pace per km is falling, i.e. getting faster.
  const slope = linearSlope(indices, paces);
  const totalDrift = slope * (body.length - 1);
  const correlation = pearson(indices, paces);

  return totalDrift <= -PROGRESSION_MIN_DRIFT_SEC_PER_KM && correlation <= -PROGRESSION_MIN_CORRELATION;
}

/**
 * Structure from segment roles, which Layer 1 already established.
 *
 * Continuous runs resolve to `steady`, never `easy`. Telling those apart needs to know what easy
 * *is* for this athlete, and the only signal available here was dominant HR zone — which produced
 * `easy` on 1 run in 332, because this athlete's easy running sits in zone 3 and zone boundaries
 * are an arbitrary device setting anyway. `easy` is therefore reachable the same way `race` is:
 * from stated intent, or later from Layer 3's comparable-run baselines.
 */
function classifyWorkoutStructure(input: Layer2TagInput): WorkoutStructure {
  const { segments } = input;
  if (segments.length === 0) return "unclear";

  const reps = segments.filter((s) => s.role === "rep");

  if (reps.length >= MIN_REPS_FOR_INTERVALS) {
    // Regular alternation is what separates a programmed interval session from a fartlek's
    // scattered, unstructured surges.
    const repIndices = segments.map((s, i) => (s.role === "rep" ? i : -1)).filter((i) => i >= 0);
    let separated = 0;
    for (let i = 0; i < repIndices.length - 1; i++) {
      const between = segments.slice(repIndices[i]! + 1, repIndices[i + 1]!);
      if (between.some((s) => s.role === "float" || s.role === "recovery")) separated++;
    }
    const ratio = repIndices.length > 1 ? separated / (repIndices.length - 1) : 0;
    return ratio >= MIN_ALTERNATION_RATIO ? "intervals" : "fartlek";
  }

  // A single hard effort inside an otherwise continuous run fits no single label cleanly.
  if (reps.length === 1) return "mixed";

  if (isProgression(segments)) return "progression";

  const paces = bodySegments(segments)
    .map((s) => s.paceSecPerKm)
    .filter((p) => Number.isFinite(p));
  if (paces.length === 0) return "unclear";

  if (coefficientOfVariation(paces) <= STEADY_PACE_CV) return "steady";

  return "unclear";
}

/**
 * Within-run decoupling: did the cardiac cost and the pace produced move together?
 *
 * Compares the first and second halves of the run's body. Warmup and cooldown are excluded because
 * both would otherwise manufacture a mismatch — a warmup is slow at low HR by design.
 */
function classifyEffortPaceMismatch(
  segments: SegmentClassification[],
  evidence: Layer2Evidence,
): EffortPaceMismatch {
  const withHr = segments.filter((s) => s.avgHr !== null);
  const portions = comparablePortions(withHr, 0.5);
  if (portions === null) return "not_applicable";

  const firstPace = median(portions.earlier.map((s) => s.paceSecPerKm));
  const secondPace = median(portions.closing.map((s) => s.paceSecPerKm));
  const firstHr = median(portions.earlier.map((s) => s.avgHr!));
  const secondHr = median(portions.closing.map((s) => s.avgHr!));
  if (firstPace <= 0 || secondPace <= 0 || firstHr <= 0 || secondHr <= 0) return "not_applicable";

  // Speed per heartbeat. Expressing the comparison as a ratio rather than as separate pace and HR
  // thresholds is what makes it scale-free: the same rule works on a 20-minute run and a marathon,
  // and on a slow athlete and a fast one.
  const firstEfficiency = 1000 / firstPace / firstHr;
  const secondEfficiency = 1000 / secondPace / secondHr;
  const decoupling = (firstEfficiency - secondEfficiency) / firstEfficiency;

  if (Math.abs(decoupling) < MISMATCH_DECOUPLING) return "consistent";

  evidence.effortPaceMismatch = {
    firstHalfPaceSecPerKm: firstPace,
    secondHalfPaceSecPerKm: secondPace,
    firstHalfHrBpm: firstHr,
    secondHalfHrBpm: secondHr,
  };

  // Positive decoupling: less speed per heartbeat than earlier — more cardiac cost for less output.
  return decoupling > 0 ? "hr_high_pace_low" : "hr_low_pace_high";
}

/**
 * Whether the closing portion ran meaningfully slower than what came before.
 *
 * Cooldown segments are excluded — a cooldown is slow on purpose, and counting it would make every
 * structured session look like a fade. Terrain and weather are deliberately *not* used to suppress
 * the flag; the climb inside the fading portion is attached as evidence instead, for Layer 3 to
 * weigh.
 */
function detectFade(
  segments: SegmentClassification[],
  splits: Split[],
  evidence: Layer2Evidence,
): boolean {
  const portions = comparablePortions(segments, 2 / 3);
  if (portions === null) return false;
  const { earlier, closing } = portions;

  const earlierPace = median(earlier.map((s) => s.paceSecPerKm));
  const closingPace = median(closing.map((s) => s.paceSecPerKm));
  if (earlierPace <= 0) return false;

  if ((closingPace - earlierPace) / earlierPace < FADE_THRESHOLD) return false;

  const closingIndices = new Set(closing.map((s) => s.splitIndex));
  const closingSplits = splits.filter((s) => closingIndices.has(s.splitIndex));
  const gains = closingSplits.map((s) => s.elevationGainM).filter((g): g is number => g !== null);

  const earlierHr = earlier.map((s) => s.avgHr).filter((h): h is number => h !== null);
  const closingHr = closing.map((s) => s.avgHr).filter((h): h is number => h !== null);

  evidence.fade = {
    paceDriftSecPerKm: closingPace - earlierPace,
    hrDriftBpm: earlierHr.length > 0 && closingHr.length > 0 ? mean(closingHr) - mean(earlierHr) : null,
    elevationGainM: gains.length > 0 ? gains.reduce((sum, g) => sum + g, 0) : null,
  };
  return true;
}

/**
 * Unplanned pickups in a run with no programmed reps.
 *
 * Only meaningful where Layer 1 found no reps: in a structured session the fast segments *are* the
 * session, and reporting them as surges would be noise.
 */
function detectSurges(segments: SegmentClassification[], evidence: Layer2Evidence): boolean {
  if (segments.some((s) => s.role === "rep")) return false;

  const body = bodySegments(segments).filter((s) => Number.isFinite(s.paceSecPerKm));
  if (body.length < 3) return false;

  const paces = body.map((s) => s.paceSecPerKm);
  const medianPace = median(paces);
  if (medianPace <= 0) return false;

  const surges = paces.filter((p) => (medianPace - p) / medianPace >= SURGE_THRESHOLD);
  if (surges.length === 0) return false;

  evidence.surge = {
    count: surges.length,
    fastestPaceSecPerKm: Math.min(...paces),
    medianPaceSecPerKm: medianPace,
  };
  return true;
}

/**
 * Pace moved with the terrain while effort stayed flat — a positive signal, and distinct from
 * `split_pattern`, which is pure pace and would read the same run as a fade.
 */
function detectEvenEffortDespiteTerrain(
  segments: SegmentClassification[],
  splits: Split[],
  evidence: Layer2Evidence,
): boolean {
  const byIndex = new Map(splits.map((s) => [s.splitIndex, s]));
  const usable = bodySegments(segments).filter((s) => {
    const split = byIndex.get(s.splitIndex);
    return s.avgHr !== null && Number.isFinite(s.paceSecPerKm) && split?.elevationGainM != null;
  });
  if (usable.length < 4) return false;

  const paces = usable.map((s) => s.paceSecPerKm);
  const gains = usable.map((s) => byIndex.get(s.splitIndex)!.elevationGainM!);
  const heartRates = usable.map((s) => s.avgHr!);

  // Normalising gain by lap distance matters here: unlike the lap-mode fallback, these laps are
  // not all the same length.
  const gainPerKm = usable.map((s, i) => (s.distanceM > 0 ? gains[i]! / (s.distanceM / 1000) : 0));

  const correlation = pearson(paces, gainPerKm);
  const hrCv = coefficientOfVariation(heartRates);

  if (correlation < TERRAIN_PACE_CORRELATION || hrCv > EVEN_EFFORT_MAX_HR_CV) return false;

  evidence.evenEffortDespiteTerrain = { paceElevationCorrelation: correlation, hrCoefficientOfVariation: hrCv };
  return true;
}

/**
 * Computes all seven Layer 2 tags in code.
 *
 * The LLM half of Layer 2 does not re-derive any of this. Its job is the two things arithmetic
 * cannot do: parse intent out of a free-text workout title, and overturn one of these flags where
 * that intent changes the reading — a planned negative-split finish is not a fade.
 */
export function computeLayer2Tags(input: Layer2TagInput): Layer2Tags {
  const evidence: Layer2Evidence = {};
  const { segments, splits, rawPointFlags } = input;

  return {
    workoutStructure: classifyWorkoutStructure(input),
    warmupCooldownDetected: segments.some((s) => s.role === "warmup" || s.role === "cooldown"),
    walkBreakPattern: hasWalkBreakPattern(rawPointFlags),
    effortPaceMismatch: classifyEffortPaceMismatch(segments, evidence),
    fadeDetected: detectFade(segments, splits, evidence),
    surgePattern: detectSurges(segments, evidence),
    evenEffortDespiteTerrain: detectEvenEffortDespiteTerrain(segments, splits, evidence),
    evidence,
  };
}
