/**
 * Grouping used by the records page. `race` separates the two classic race distances from the
 * training ladder — they belong together regardless of which measurement system they came from.
 */
export type DistanceCategory = "km" | "mi" | "race";

export interface StandardDistance {
  /**
   * Metres, rounded to an integer. Sub-metre precision is meaningless against GPS distance error
   * and makes for an awkward database key — the mile is 1609.34m and the half 21097.5m.
   */
  distanceM: number;
  label: string;
  category: DistanceCategory;
}

/**
 * Distances searched for within every run when detecting best efforts.
 *
 * Ordered ascending so a run's efforts render in a sensible order without the consumer sorting.
 * Metric and imperial are interleaved deliberately: the list reads as a ladder of efforts rather
 * than as two separate systems.
 */
export const STANDARD_DISTANCES: readonly StandardDistance[] = [
  { distanceM: 1000, label: "1 km", category: "km" },
  { distanceM: 1609, label: "1 mile", category: "mi" },
  { distanceM: 2000, label: "2 km", category: "km" },
  { distanceM: 3219, label: "2 miles", category: "mi" },
  { distanceM: 5000, label: "5 km", category: "km" },
  { distanceM: 8047, label: "5 miles", category: "mi" },
  { distanceM: 10000, label: "10 km", category: "km" },
  { distanceM: 15000, label: "15 km", category: "km" },
  { distanceM: 16093, label: "10 miles", category: "mi" },
  { distanceM: 20000, label: "20 km", category: "km" },
  { distanceM: 21097, label: "Half marathon", category: "race" },
  { distanceM: 42195, label: "Marathon", category: "race" },
];

export const STANDARD_DISTANCES_M: readonly number[] = STANDARD_DISTANCES.map((d) => d.distanceM);

export function standardDistancesIn(category: DistanceCategory): readonly StandardDistance[] {
  return STANDARD_DISTANCES.filter((d) => d.category === category);
}

/** Falls back to a plain kilometre reading for a distance that isn't in the standard ladder. */
export function standardDistanceLabel(distanceM: number): string {
  return STANDARD_DISTANCES.find((d) => d.distanceM === distanceM)?.label ?? `${(distanceM / 1000).toFixed(1)} km`;
}
