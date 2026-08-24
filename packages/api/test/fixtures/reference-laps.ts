import type { Split } from "@run-review/shared";

/**
 * Lap data from three real runs, used to pin the analysis thresholds to observed behaviour rather
 * than to invented numbers. Distances and durations are verbatim from the imported data; HR and
 * elevation are included only where a test depends on them.
 *
 * These three are deliberately the calibration set: one generic auto-split run and two programmed
 * sessions whose shapes broke the original spec's assumptions.
 */

function lap(
  splitIndex: number,
  distanceM: number,
  durationSec: number,
  avgHr: number | null = null,
  elevationGainM: number | null = null,
): Split {
  return {
    id: `lap-${splitIndex}`,
    splitIndex,
    startTimeGmt: new Date(Date.UTC(2026, 1, 1, 0, 0, splitIndex)).toISOString(),
    distanceM,
    durationSec,
    avgSpeedMps: distanceM / durationSec,
    avgHr,
    maxHr: avgHr,
    avgCadenceSpm: null,
    elevationGainM,
    elevationLossM: null,
  };
}

/**
 * Generic 10.07km run — ten 1000m auto-splits plus a remainder. Successive pace changes here are
 * −5.2%, +8.3%, −3.2%, +2.6%, +1.9%, +2.3%, −3.6%, +1.2%, +1.5%: median absolute 2.6%, max 8.3%.
 * This is the run the pace-alternation threshold must never trip on.
 */
export const genericEasyRunLaps: Split[] = [
  lap(1, 1000, 344.5, 145),
  lap(2, 1000, 326.5, 154),
  lap(3, 1000, 353.2, 153),
  lap(4, 1000, 342.0, 153),
  lap(5, 1000, 351.1, 154),
  lap(6, 1000, 357.8, 156),
  lap(7, 1000, 365.7, 157),
  lap(8, 1000, 352.6, 156),
  lap(9, 1000, 357.2, 157),
  lap(10, 1000, 362.3, 159),
  lap(11, 67.3, 23.7, 161),
];

/**
 * "W2 Sat Tempo - Tempo 2-1-1 (7.5k)", 7 Feb 2026. Seven 1000m laps interleaved with time-boxed
 * recoveries at variable distance (120s, 90s, 90s) — the run that disproves the spec's
 * lap-uniformity variance test.
 */
export const tempoIntervalLaps: Split[] = [
  lap(1, 1000, 332.1, 138),
  lap(2, 1000, 325.9, 149),
  lap(3, 1000, 287.0, 162),
  lap(4, 1000, 296.4, 166),
  lap(5, 245.8, 120.0, 145),
  lap(6, 1000, 269.9, 165),
  lap(7, 185.0, 90.0, 151),
  lap(8, 1000, 268.4, 164),
  lap(9, 175.8, 90.0, 154),
  lap(10, 1000, 347.3, 153),
  lap(11, 500, 157.9, 161),
  lap(12, 1000, 308.2, 164),
  lap(13, 49.7, 16.2, 164),
];

/**
 * "W3 Fri Tempo - Rolling 300s (8.9k)", 13 Feb 2026. Reps and floats are both 300m, separated
 * only by pace — the run that disproves classifying lap role by geometry. Lap 8 (94.6m at
 * 11.06 min/km, HR collapsing to 83) is a genuine unplanned stop, not a programmed float.
 */
export const rolling300sLaps: Split[] = [
  lap(1, 1000, 348.5, 134, 15.5),
  lap(2, 1000, 350.3, 143, 2.2),
  lap(3, 500, 173.2, 143, 0),
  lap(4, 300, 84.0, 154, 0),
  lap(5, 300, 101.6, 153, 0),
  lap(6, 300, 80.2, 155, 0),
  lap(7, 300, 97.1, 154, 0),
  lap(8, 94.6, 62.8, 83, 0),
  lap(9, 300, 96.4, 119, 0),
  lap(10, 300, 83.0, 124, 0),
  lap(11, 300, 96.7, 127, 0),
  lap(12, 300, 69.1, 137, 0),
  lap(13, 300, 99.9, 135, 0),
  lap(14, 300, 83.8, 137, 1.1),
  lap(15, 300, 93.5, 140, 0),
  lap(16, 300, 82.1, 135, 0),
  lap(17, 300, 83.9, 131, 0),
  lap(18, 177.0, 90.0, 124, 2.2),
  lap(19, 1000, 327.0, 133, 2.2),
  lap(20, 1000, 327.9, 141, 3.6),
  lap(21, 200, 71.8, 148, 2.4),
  lap(22, 291.7, 97.9, 145, 2.5),
];

/**
 * Synthetic: a session programmed entirely in 1km segments (5×1km hard with 1km jog recovery).
 * All laps are 1000m so the length test cannot see it — this is what the pace-alternation
 * fallback exists for. Hard laps ~3:45/km, recovery jogs ~6:00/km.
 */
export const allKilometreRepsLaps: Split[] = [
  lap(1, 1000, 360, 140, 0),
  lap(2, 1000, 225, 172, 0),
  lap(3, 1000, 358, 138, 0),
  lap(4, 1000, 228, 174, 0),
  lap(5, 1000, 362, 140, 0),
  lap(6, 1000, 226, 175, 0),
  lap(7, 1000, 359, 139, 0),
  lap(8, 1000, 230, 173, 0),
  lap(9, 1000, 361, 141, 0),
  lap(10, 412.5, 150, 150, 0),
];

/**
 * A real run (15 Jul 2026, generically named "City of Edinburgh Running") that an earlier version
 * of the pace-alternation fallback wrongly called a rep session. Pace swings from 5:52 to 7:47/km
 * across five 1km laps — clearing both the amplitude and alternation gates — but HR stays at
 * 157–159 through the slow laps instead of dropping, which is what an interrupted easy run looks
 * like and a rep session does not. Elevation is unset, so the terrain guard cannot save it either;
 * only the HR-separation check rejects this.
 */
export const interruptedEasyRunLaps: Split[] = [
  lap(1, 1000, 352.0, 157),
  lap(2, 1000, 449.7, 158),
  lap(3, 1000, 467.6, 159),
  lap(4, 1000, 341.5, 169),
  lap(5, 1000, 350.3, 164),
  lap(6, 738.5, 361.4, 163),
];

/**
 * Synthetic: a hilly continuous run whose pace swings as much as a rep session, but in lockstep
 * with per-lap elevation gain. The terrain guard must keep this classified `auto`.
 */
export const hillyContinuousLaps: Split[] = [
  lap(1, 1000, 330, 150, 4),
  lap(2, 1000, 415, 158, 62),
  lap(3, 1000, 322, 149, 3),
  lap(4, 1000, 430, 160, 71),
  lap(5, 1000, 318, 148, 2),
  lap(6, 1000, 421, 159, 66),
  lap(7, 1000, 327, 150, 5),
  lap(8, 640, 210, 152, 8),
];
