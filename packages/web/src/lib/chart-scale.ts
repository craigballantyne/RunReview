export type Scale = (value: number) => number;

export function createLinearScale(domain: [number, number], range: [number, number]): Scale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0;
  return (value: number) => (span === 0 ? (r0 + r1) / 2 : r0 + ((value - d0) / span) * (r1 - r0));
}

/** Min/max of a value list, padded by a fraction of the range on each side (never below zero-span). */
export function computeDomain(values: number[], padFraction = 0.1): [number, number] {
  if (values.length === 0) return [0, 1];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return [min - 1, max + 1];
  const pad = (max - min) * padFraction;
  return [min - pad, max + pad];
}

/** Evenly spaced tick values across a domain, inclusive of both ends. */
export function generateTicks(domain: [number, number], count: number): number[] {
  const [d0, d1] = domain;
  if (count <= 1) return [d0];
  const step = (d1 - d0) / (count - 1);
  return Array.from({ length: count }, (_, i) => d0 + step * i);
}

/** Finds the index of the entry whose x-value is closest to the target. */
export function findNearestIndex<T>(items: T[], getX: (item: T) => number, target: number): number {
  let nearestIndex = 0;
  let nearestDist = Infinity;
  for (let i = 0; i < items.length; i++) {
    const dist = Math.abs(getX(items[i] as T) - target);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearestIndex = i;
    }
  }
  return nearestIndex;
}
