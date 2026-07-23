import type { RunDetail } from "@run-review/shared";
import { formatDuration } from "@run-review/shared";
import { TrackPointChart } from "./TrackPointChart.js";
import { StatRow } from "./StatRow.js";

const ELEVATION_COLOR = "#16a34a"; // green-600 — matches the map's elevation gradient hue family

function formatMeters(value: number | null): string {
  return value !== null ? `${Math.round(value)} m` : "–";
}

export function ElevationSection({ run }: { run: RunDetail }) {
  const points = run.trackPoints
    .slice()
    .sort((a, b) => a.pointIndex - b.pointIndex)
    .map((p) => ({ x: p.elapsedSec, y: p.elevationM }));

  const elevationValues = points.map((p) => p.y).filter((v): v is number => v !== null);
  const minElevation = elevationValues.length > 0 ? Math.min(...elevationValues) : null;
  const maxElevation = elevationValues.length > 0 ? Math.max(...elevationValues) : null;

  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-gray-900">Elevation</h3>
      <StatRow
        stats={[
          { label: "Min elevation", value: formatMeters(minElevation) },
          { label: "Max elevation", value: formatMeters(maxElevation) },
          { label: "Elevation gain", value: formatMeters(run.elevationGainM) },
          { label: "Elevation loss", value: formatMeters(run.elevationLossM) },
        ]}
      />
      <div className="mt-3">
        <TrackPointChart
          points={points}
          mark="area"
          color={ELEVATION_COLOR}
          xTickFormat={formatDuration}
          yTickFormat={(v) => `${Math.round(v)}m`}
          tooltipValueFormat={(v) => `${Math.round(v)} m`}
        />
      </div>
    </section>
  );
}
