import { STANDARD_DISTANCES_M, type BestEffort } from "@run-review/shared";
import type { DistanceChannel } from "./distance-channel.js";

/**
 * Fastest continuous window covering `targetM`, found anywhere in the run.
 *
 * Two-pointer over the cumulative distance channel, so each distance costs one linear pass rather
 * than the naive nested scan. This is why best-effort detection stays an always-on part of Layer 1
 * instead of the on-demand job the original spec assumed it would have to be: a dozen distances
 * over ~1800 points is a few thousand operations.
 *
 * The window end is interpolated between bracketing points so the effort covers exactly the target
 * distance, rather than whatever overshoot the next recorded point happens to land on.
 */
function fastestWindow(channel: DistanceChannel, targetM: number): BestEffort | null {
  const { points, cumulativeM } = channel;
  const n = points.length;
  if (n < 2) return null;

  const totalM = cumulativeM[n - 1]!;
  if (totalM < targetM) return null;

  let best: BestEffort | null = null;
  let end = 1;

  for (let start = 0; start < n; start++) {
    const startM = cumulativeM[start]!;
    const targetEndM = startM + targetM;
    if (targetEndM > totalM) break;

    // `end` only ever moves forward: targetEndM grows monotonically with `start`.
    if (end < start + 1) end = start + 1;
    while (end < n && cumulativeM[end]! < targetEndM) end++;
    if (end >= n) break;

    const lo = cumulativeM[end - 1]!;
    const hi = cumulativeM[end]!;
    const loSec = points[end - 1]!.elapsedSec;
    const hiSec = points[end]!.elapsedSec;
    const endSec = hi === lo ? hiSec : loSec + ((targetEndM - lo) / (hi - lo)) * (hiSec - loSec);

    const durationSec = endSec - points[start]!.elapsedSec;
    if (durationSec <= 0) continue;

    if (best === null || durationSec < best.durationSec) {
      best = { distanceM: targetM, durationSec, startOffsetM: startM };
    }
  }

  return best;
}

/**
 * Every standard-distance best effort contained in a run.
 *
 * Embedded detection, not whole-run matching: a 10k PR set during a 15k long run counts, which is
 * the point of searching within the track rather than only comparing runs whose total happens to
 * land on a standard distance.
 *
 * Returns nothing for a channel estimated from elapsed time — with distance interpolated from
 * time, every window of a given distance takes an identical duration and "fastest" is meaningless.
 */
export function detectBestEfforts(channel: DistanceChannel): BestEffort[] {
  if (channel.estimatedFromTime) return [];

  const efforts: BestEffort[] = [];
  for (const distanceM of STANDARD_DISTANCES_M) {
    const effort = fastestWindow(channel, distanceM);
    if (effort !== null) efforts.push(effort);
  }
  return efforts;
}

/**
 * Marks which of this run's best efforts beat everything the athlete had done before.
 *
 * Point-in-time by construction: `previousBestByDistanceM` holds only history *preceding* this
 * run, so `isPr` means "was a personal best when it was set" — which is both the semantically
 * correct meaning of a PR and a running-best comparison rather than a full-history rescan.
 */
export function markPersonalRecords(
  efforts: BestEffort[],
  previousBestByDistanceM: Map<number, number>,
): Array<BestEffort & { isPr: boolean }> {
  return efforts.map((effort) => {
    const previous = previousBestByDistanceM.get(effort.distanceM);
    return { ...effort, isPr: previous === undefined || effort.durationSec < previous };
  });
}
