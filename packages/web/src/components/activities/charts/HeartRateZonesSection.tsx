import type { RunDetail } from "@run-review/shared";
import { formatDuration } from "@run-review/shared";

const ZONE_COLORS: Record<number, string> = {
  1: "#d1d5db", // light grey
  2: "#22c55e", // green
  3: "#3b82f6", // blue
  4: "#f97316", // orange
  5: "#ef4444", // red
};
const DEFAULT_ZONE_COLOR = "#9ca3af";

function formatZoneRange(lower: number | null, upper: number | null): string {
  if (lower === null) return "–";
  if (upper === null) return `${lower}+ bpm`;
  return `${lower}-${upper} bpm`;
}

export function HeartRateZonesSection({ run }: { run: RunDetail }) {
  const sortedZones = run.hrZones.slice().sort((a, b) => a.zoneNumber - b.zoneNumber);

  if (sortedZones.length === 0) return null;

  const zones = sortedZones.map((zone, i) => {
    // The source data only ever reports each zone's lower bound — the upper bound is implied by
    // the next zone's lower bound, with the top zone left open-ended.
    const nextZone = sortedZones[i + 1];
    const upperBpm = zone.zoneHighBpm ?? nextZone?.zoneLowBpm ?? null;
    return {
      zoneNumber: zone.zoneNumber,
      seconds: zone.secondsInZone,
      rangeLabel: formatZoneRange(zone.zoneLowBpm, upperBpm),
      color: ZONE_COLORS[zone.zoneNumber] ?? DEFAULT_ZONE_COLOR,
    };
  });

  const maxSeconds = Math.max(1, ...zones.map((z) => z.seconds));

  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold text-gray-900">Heart rate zones</h3>
      <div className="space-y-2">
        {zones.map((zone) => (
          <div key={zone.zoneNumber} className="flex items-center gap-3">
            <div className="w-28 shrink-0">
              <div className="text-xs font-medium text-gray-900">Zone {zone.zoneNumber}</div>
              <div className="text-xs text-gray-500">{zone.rangeLabel}</div>
            </div>
            <div className="h-5 flex-1 overflow-hidden rounded bg-gray-100">
              <div
                className="h-full rounded"
                style={{ width: `${(zone.seconds / maxSeconds) * 100}%`, backgroundColor: zone.color }}
              />
            </div>
            <div className="w-20 shrink-0 text-right text-xs font-semibold text-gray-900">
              {formatDuration(zone.seconds)}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
