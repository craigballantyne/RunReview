import type { LapMode, SegmentClassification, SegmentRole, Split } from "@run-review/shared";
import { median } from "./stats.js";

/**
 * How much faster than the session median a lap must be to read as a rep.
 *
 * Calibrated on the 7 Feb session, whose slowest rep (4:56/km) and fastest cooldown lap (5:08/km)
 * are only 12 sec/km apart around a 5:21/km median. 6% puts the boundary between them with room
 * either side; 8% loses the rep and 4% gains the cooldown lap.
 *
 * Known limitation: this is a margin from the *session median*, so it degrades on a session that
 * is almost entirely reps with minimal recovery, where the median itself sits among the reps and
 * only the faster half clears the ceiling. Sessions like that are rare in practice and Layer 2
 * sees the pace of every segment regardless, so the failure is visible rather than silent.
 */
const REP_MARGIN = 0.06;

/**
 * How much slower than the session median a lap must be to read as a recovery rather than a float.
 * Floats in a rolling session sit close to the median; genuine recovery jogs and stops sit far
 * outside it.
 */
const RECOVERY_MARGIN = 0.25;

/** How much slower than the median a leading/trailing lap must be to read as warmup or cooldown. */
const AUTO_END_MARGIN = 0.1;

function paceSecPerKm(split: Split): number {
  return split.distanceM > 0 ? split.durationSec / (split.distanceM / 1000) : Number.POSITIVE_INFINITY;
}

/**
 * Assigns each lap a role within its session, from pace and HR relative to that session.
 *
 * Role is deliberately not inferred from lap geometry. Two real sessions rule that out: the
 * "rolling 300s" session alternates hard and float segments that are *both* 300m, and the
 * "tempo 2-1-1" session's recoveries are time-boxed (120s, 90s, 90s) at variable distance. Only
 * pace separates them.
 *
 * Reps anchor everything else: warmup is whatever precedes the first rep, cooldown whatever
 * follows the last. That ordering matters because warmup pace and float pace overlap heavily —
 * in the 7 Feb session the warmup laps run 5:32/5:26 per km while floats run around 5:20, so a
 * pace-only rule cannot tell them apart, but position can.
 */
export function classifySegmentRoles(splits: Split[], lapMode: LapMode): SegmentClassification[] {
  const ordered = [...splits].sort((a, b) => a.splitIndex - b.splitIndex);
  if (ordered.length === 0) return [];

  // The trailing remainder is short and its pace is noisy, so it skews the session median it would
  // otherwise help define. It still receives a role below.
  const forThresholds = ordered.length > 1 ? ordered.slice(0, -1) : ordered;
  const medianPace = median(forThresholds.map(paceSecPerKm).filter((p) => Number.isFinite(p)));

  if (medianPace <= 0) {
    return ordered.map((split) => toClassification(split, "steady"));
  }

  const repCeiling = medianPace * (1 - REP_MARGIN);
  const recoveryFloor = medianPace * (1 + RECOVERY_MARGIN);

  const isRep = ordered.map((split) => lapMode === "structured" && paceSecPerKm(split) < repCeiling);
  const firstRep = isRep.indexOf(true);
  const lastRep = isRep.lastIndexOf(true);

  return ordered.map((split, i) => {
    const pace = paceSecPerKm(split);

    if (isRep[i]) return toClassification(split, "rep");

    // No reps anywhere — an auto-split run, or a structured run with no clear work segments.
    // Warmup and cooldown then have to come from pace at the ends rather than from position.
    if (firstRep === -1) {
      const isLeadingEdge = i === 0;
      const isTrailingEdge = i === ordered.length - 1 || (i === ordered.length - 2 && ordered.length > 2);
      if (pace > medianPace * (1 + AUTO_END_MARGIN)) {
        if (isLeadingEdge) return toClassification(split, "warmup");
        if (isTrailingEdge) return toClassification(split, "cooldown");
      }
      return toClassification(split, "steady");
    }

    // A lap far slower than the session median is a recovery wherever it sits — including inside
    // the cooldown, where a walk break is still a walk break.
    if (pace > recoveryFloor) return toClassification(split, "recovery");
    if (i < firstRep) return toClassification(split, "warmup");
    if (i > lastRep) return toClassification(split, "cooldown");
    return toClassification(split, "float");
  });
}

function toClassification(split: Split, role: SegmentRole): SegmentClassification {
  return {
    splitIndex: split.splitIndex,
    role,
    distanceM: split.distanceM,
    durationSec: split.durationSec,
    paceSecPerKm: paceSecPerKm(split),
    avgHr: split.avgHr,
  };
}

/** True when the session has a distinct slow segment at the start or the end. */
export function hasWarmupOrCooldown(segments: SegmentClassification[]): boolean {
  return segments.some((s) => s.role === "warmup" || s.role === "cooldown");
}
