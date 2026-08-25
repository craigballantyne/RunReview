/**
 * Small statistics helpers shared across the analysis modules.
 *
 * Extracted once several modules had grown their own copies of `median` and a Pearson correlation.
 * Every function here returns a defined number for degenerate input rather than `NaN`, because
 * these feed threshold comparisons — and `NaN` silently fails every comparison it touches, which
 * would turn a missing-data case into a quiet "no signal" instead of an obvious one.
 */

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/** Population standard deviation. Zero for fewer than two values. */
export function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  return Math.sqrt(mean(values.map((v) => (v - avg) ** 2)));
}

/**
 * Pearson correlation coefficient. Returns 0 when either series is constant — no correlation is
 * measurable against a flat line, and 0 is the answer that makes threshold checks behave.
 */
export function pearson(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;

  const meanX = mean(xs.slice(0, n));
  const meanY = mean(ys.slice(0, n));

  let numerator = 0;
  let sumSqX = 0;
  let sumSqY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - meanX;
    const dy = ys[i]! - meanY;
    numerator += dx * dy;
    sumSqX += dx * dx;
    sumSqY += dy * dy;
  }

  const denominator = Math.sqrt(sumSqX * sumSqY);
  return denominator === 0 ? 0 : numerator / denominator;
}

/**
 * Slope of the least-squares line through (x, y). Zero when x is constant.
 *
 * Used where the *direction and magnitude* of a trend matters rather than how tightly the points
 * fit it — `pearson` answers the second question, this one answers the first.
 */
export function linearSlope(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;

  const meanX = mean(xs.slice(0, n));
  const meanY = mean(ys.slice(0, n));

  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - meanX;
    numerator += dx * (ys[i]! - meanY);
    denominator += dx * dx;
  }

  return denominator === 0 ? 0 : numerator / denominator;
}

/** Coefficient of variation — spread relative to magnitude, so it compares across scales. */
export function coefficientOfVariation(values: number[]): number {
  const avg = mean(values);
  if (avg === 0) return 0;
  return standardDeviation(values) / Math.abs(avg);
}
