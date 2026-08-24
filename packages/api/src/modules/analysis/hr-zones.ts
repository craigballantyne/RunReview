import type { HrZone, HrZoneDistribution, HrZoneLabel } from "@run-review/shared";

const ZONE_LABELS: Record<number, HrZoneLabel> = {
  1: "zone_1",
  2: "zone_2",
  3: "zone_3",
  4: "zone_4",
  5: "zone_5",
};

export interface HrZoneSummary {
  /** Zone holding the most time. Null when the run has no HR zone data. */
  dominant: HrZoneLabel | null;
  /** Fraction of zoned time per zone. Zones with no time are omitted, not zeroed. */
  distribution: HrZoneDistribution;
}

/**
 * Summarises time-in-zone from the device's own per-run HR zones.
 *
 * Taken directly rather than recomputed from track points: the device already reports
 * `secondsInZone` against the athlete's configured boundaries, and re-deriving it would mean
 * inventing zone thresholds the app doesn't store.
 *
 * Caveat for consumers: HR lags effort, so short reps are systematically under-represented here.
 * A 300m rep at 3:50/km may never drive HR into zone 5. This distribution describes cardiac load,
 * not session intensity, and Layer 2 must not read it as the latter on interval runs.
 */
export function summariseHrZones(zones: HrZone[]): HrZoneSummary {
  const usable = zones.filter((z) => ZONE_LABELS[z.zoneNumber] !== undefined && z.secondsInZone > 0);
  const total = usable.reduce((sum, z) => sum + z.secondsInZone, 0);
  if (total <= 0) return { dominant: null, distribution: {} };

  const distribution: HrZoneDistribution = {};
  for (const zone of usable) {
    const label = ZONE_LABELS[zone.zoneNumber]!;
    distribution[label] = (distribution[label] ?? 0) + zone.secondsInZone / total;
  }

  const dominant = usable.reduce((best, z) => (z.secondsInZone > best.secondsInZone ? z : best));
  return { dominant: ZONE_LABELS[dominant.zoneNumber]!, distribution };
}

/**
 * Upper bound for a zone. The device leaves `zoneHighBpm` null, so it's inferred from the next
 * zone's lower bound; the top zone is genuinely open-ended and stays null.
 */
export function resolveZoneCeilingBpm(zones: HrZone[], zoneNumber: number): number | null {
  const next = zones.find((z) => z.zoneNumber === zoneNumber + 1);
  return next?.zoneLowBpm ?? null;
}
