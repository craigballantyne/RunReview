import type { LapMode, SplitPattern } from "@run-review/shared";
import type { DistanceChannel } from "./distance-channel.js";

/**
 * Equal-distance bins the run is reduced to before fitting. Regressing raw 2-second points would
 * fit mostly noise — instantaneous speed swings far more than the run-level trend this measures.
 */
const BIN_COUNT = 20;

/**
 * Implied start-to-finish pace change, as a fraction of mean pace, within which a run counts as
 * evenly paced. A tighter band makes `even_split` rarer and more meaningful.
 */
const EVEN_BAND = 0.03;

interface Bin {
  centreM: number;
  paceSecPerKm: number;
}

/**
 * Reduces the track to equal-distance bins, each carrying the pace actually run over that stretch.
 * Bins with no elapsed time (a pause spanning the whole bin) are dropped rather than reported as
 * infinitely fast.
 */
function buildBins(channel: DistanceChannel): Bin[] {
  const { points, cumulativeM } = channel;
  if (points.length < 2) return [];

  const totalM = cumulativeM[cumulativeM.length - 1]!;
  if (totalM <= 0) return [];

  const binWidthM = totalM / BIN_COUNT;
  const bins: Bin[] = [];

  for (let b = 0; b < BIN_COUNT; b++) {
    const startM = b * binWidthM;
    const endM = (b + 1) * binWidthM;

    let startSec: number | null = null;
    let endSec: number | null = null;
    for (let i = 0; i < points.length; i++) {
      if (startSec === null && cumulativeM[i]! >= startM) startSec = points[i]!.elapsedSec;
      if (cumulativeM[i]! <= endM) endSec = points[i]!.elapsedSec;
    }
    if (startSec === null || endSec === null) continue;

    const elapsed = endSec - startSec;
    if (elapsed <= 0) continue;

    bins.push({ centreM: (startM + endM) / 2, paceSecPerKm: elapsed / (binWidthM / 1000) });
  }

  return bins;
}

/**
 * Classifies a run's pace trend by fitting pace against distance.
 *
 * `not_applicable` on structured sessions. A regression slope through an interval session is
 * noise — "negative split" is a coherent property of a continuous effort and a meaningless one
 * for a set of reps — and reporting a number here would invite Layer 3 to cite it as though it
 * meant something.
 */
export function classifySplitPattern(channel: DistanceChannel, lapMode: LapMode): SplitPattern {
  if (lapMode === "structured") return "not_applicable";

  const bins = buildBins(channel);
  if (bins.length < 3) return "not_applicable";

  const n = bins.length;
  const meanX = bins.reduce((s, b) => s + b.centreM, 0) / n;
  const meanY = bins.reduce((s, b) => s + b.paceSecPerKm, 0) / n;

  let num = 0;
  let den = 0;
  for (const bin of bins) {
    const dx = bin.centreM - meanX;
    num += dx * (bin.paceSecPerKm - meanY);
    den += dx * dx;
  }
  if (den === 0 || meanY <= 0) return "not_applicable";

  // Slope is sec/km of pace change per metre travelled; scaling by the run's length turns it into
  // the total pace drift implied from first metre to last, which is the thing worth thresholding.
  const totalM = channel.cumulativeM[channel.cumulativeM.length - 1]!;
  const impliedChange = (num / den) * totalM;
  const relative = impliedChange / meanY;

  if (relative > EVEN_BAND) return "positive_split";
  if (relative < -EVEN_BAND) return "negative_split";
  return "even_split";
}
