import type { RunDetail } from "@run-review/shared";
import { calculatePaceSecPerKm, formatDuration, formatMinSec, paceSecPerKmFromSpeed } from "@run-review/shared";
import { TrackPointChart } from "./TrackPointChart.js";
import { StatRow } from "./StatRow.js";

const PACE_COLOR = "#2563eb"; // blue-600 — matches the map's pace gradient hue family

// Paused / near-stationary track points produce huge sec/km outliers that would otherwise
// stretch the axis and flatten every real bar. Cap what the chart's scale considers, without
// touching the true stats shown in the stat row above it.
const CHART_MAX_PACE_SEC_PER_KM = 15 * 60;

function formatPaceValue(secPerKm: number): string {
  return `${formatMinSec(secPerKm)} /km`;
}

export function PaceSection({ run }: { run: RunDetail }) {
  const averagePace = calculatePaceSecPerKm(run.movingDurationSec, run.distanceM);
  const maxPace = paceSecPerKmFromSpeed(run.maxSpeedMps); // fastest instant pace, from peak speed

  const points = run.trackPoints
    .slice()
    .sort((a, b) => a.pointIndex - b.pointIndex)
    .map((p) => {
      const pace = paceSecPerKmFromSpeed(p.speedMps);
      return { x: p.elapsedSec, y: pace !== null ? Math.min(pace, CHART_MAX_PACE_SEC_PER_KM) : null };
    });

  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-gray-900">Pace</h3>
      <StatRow
        stats={[
          { label: "Average pace", value: averagePace !== null ? formatPaceValue(averagePace) : "–" },
          { label: "Max pace", value: maxPace !== null ? formatPaceValue(maxPace) : "–" },
        ]}
      />
      <div className="mt-3">
        <TrackPointChart
          points={points}
          mark="bar"
          color={PACE_COLOR}
          averageValue={averagePace !== null ? Math.min(averagePace, CHART_MAX_PACE_SEC_PER_KM) : null}
          averageLabel={averagePace !== null ? `Avg ${formatMinSec(averagePace)}` : undefined}
          xTickFormat={formatDuration}
          yTickFormat={formatMinSec}
          tooltipValueFormat={formatPaceValue}
          invertY
          yDomainMax={CHART_MAX_PACE_SEC_PER_KM}
        />
      </div>
    </section>
  );
}
