import type { RunTypeByDistance } from "@run-review/shared";

/** Trailing window the athlete's own "normal" distance is measured over. */
export const ROLLING_WINDOW_DAYS = 90;

/**
 * Prior runs needed in the window before relative classification is trusted. Below this the median
 * is too easily dominated by one or two atypical runs, so fixed absolutes are the safer answer.
 */
const MIN_RUNS_FOR_RELATIVE = 10;

const LONG_MULTIPLE = 1.5;
const SHORT_MULTIPLE = 0.75;

/** Cold-start fallbacks, used until enough history exists to measure the athlete against itself. */
const COLD_START_SHORT_CEILING_M = 5000;
const COLD_START_LONG_FLOOR_M = 15000;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/**
 * Classifies a run's distance relative to the athlete's own recent norm.
 *
 * `priorDistancesM` must contain only runs from the trailing window that happened *before* this
 * one. That is what makes the result a point-in-time fact: a run classified today never changes
 * because of runs logged later.
 *
 * The original spec defines only `long` (≥1.5× the rolling median); `short` at ≤0.75× is the
 * symmetric counterpart, chosen so the bands are wide enough that ordinary week-to-week variation
 * stays `medium`.
 */
export function classifyRunTypeByDistance(distanceM: number, priorDistancesM: number[]): RunTypeByDistance {
  const usable = priorDistancesM.filter((d) => d > 0);

  if (usable.length < MIN_RUNS_FOR_RELATIVE) {
    if (distanceM < COLD_START_SHORT_CEILING_M) return "short";
    if (distanceM > COLD_START_LONG_FLOOR_M) return "long";
    return "medium";
  }

  const baseline = median(usable);
  if (baseline <= 0) return "medium";

  if (distanceM >= baseline * LONG_MULTIPLE) return "long";
  if (distanceM <= baseline * SHORT_MULTIPLE) return "short";
  return "medium";
}
