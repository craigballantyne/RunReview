import type { HrZone } from "@run-review/shared";
import { describe, expect, it } from "vitest";
import { resolveZoneCeilingBpm, summariseHrZones } from "../../src/modules/analysis/hr-zones.js";

/** Verbatim from the reference 10k run — note every `zoneHighBpm` is null, as the device sends it. */
const referenceZones: HrZone[] = [
  { id: "z1", zoneNumber: 1, zoneLowBpm: 115, zoneHighBpm: null, secondsInZone: 16.0 },
  { id: "z2", zoneNumber: 2, zoneLowBpm: 130, zoneHighBpm: null, secondsInZone: 26.999 },
  { id: "z3", zoneNumber: 3, zoneLowBpm: 144, zoneHighBpm: null, secondsInZone: 2930.945 },
  { id: "z4", zoneNumber: 4, zoneLowBpm: 159, zoneHighBpm: null, secondsInZone: 550.034 },
  { id: "z5", zoneNumber: 5, zoneLowBpm: 173, zoneHighBpm: null, secondsInZone: 0.0 },
];

describe("summariseHrZones", () => {
  it("picks the dominant zone from the reference run", () => {
    expect(summariseHrZones(referenceZones).dominant).toBe("zone_3");
  });

  it("reports the distribution as fractions summing to one", () => {
    const { distribution } = summariseHrZones(referenceZones);
    const total = Object.values(distribution).reduce((s, v) => s + v, 0);

    expect(total).toBeCloseTo(1, 6);
    expect(distribution.zone_3!).toBeCloseTo(0.8317, 4);
    expect(distribution.zone_4!).toBeCloseTo(0.1561, 4);
  });

  it("omits zones with no time rather than reporting them as zero", () => {
    // Padding empty fields invites Layer 3 to comment on their absence.
    expect(summariseHrZones(referenceZones).distribution.zone_5).toBeUndefined();
  });

  it("returns no summary for a run without HR zones", () => {
    expect(summariseHrZones([])).toEqual({ dominant: null, distribution: {} });
  });

  it("ignores zone numbers outside the device's five", () => {
    const withZoneZero: HrZone[] = [
      { id: "z0", zoneNumber: 0, zoneLowBpm: 0, zoneHighBpm: null, secondsInZone: 9999 },
      ...referenceZones,
    ];
    expect(summariseHrZones(withZoneZero).dominant).toBe("zone_3");
  });
});

describe("resolveZoneCeilingBpm", () => {
  it("infers a zone's ceiling from the next zone's floor", () => {
    expect(resolveZoneCeilingBpm(referenceZones, 3)).toBe(159);
  });

  it("leaves the top zone open-ended", () => {
    expect(resolveZoneCeilingBpm(referenceZones, 5)).toBeNull();
  });
});
