import type { RunDetail } from "@run-review/shared";
import { formatDuration } from "@run-review/shared";
import { TrackPointChart } from "./TrackPointChart.js";
import { StatRow } from "./StatRow.js";

const HEART_RATE_COLOR = "#dc2626"; // red-600 — matches the map's heart rate gradient hue family

export function HeartRateSection({ run }: { run: RunDetail }) {
  const points = run.trackPoints
    .slice()
    .sort((a, b) => a.pointIndex - b.pointIndex)
    .map((p) => ({ x: p.elapsedSec, y: p.heartRate }));

  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-gray-900">Heart rate</h3>
      <StatRow
        stats={[
          { label: "Average HR", value: run.avgHr !== null ? `${run.avgHr} bpm` : "–" },
          { label: "Max HR", value: run.maxHr !== null ? `${run.maxHr} bpm` : "–" },
        ]}
      />
      <div className="mt-3">
        <TrackPointChart
          points={points}
          mark="line"
          color={HEART_RATE_COLOR}
          averageValue={run.avgHr}
          averageLabel={run.avgHr !== null ? `Avg ${run.avgHr}` : undefined}
          xTickFormat={formatDuration}
          yTickFormat={(v) => String(Math.round(v))}
          tooltipValueFormat={(v) => `${Math.round(v)} bpm`}
        />
      </div>
    </section>
  );
}
