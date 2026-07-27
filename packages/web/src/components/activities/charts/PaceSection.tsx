import { useMemo, useState } from "react";
import type { RunDetail } from "@run-review/shared";
import {
  calculateAverageGapPaceSecPerKm,
  calculateGapPaceSeries,
  calculateMaxGapPaceSecPerKm,
  calculatePaceSecPerKm,
  formatDuration,
  formatMinSec,
  paceSecPerKmFromSpeed,
} from "@run-review/shared";
import { Switch } from "../../common/Switch.js";
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
  const [showGap, setShowGap] = useState(false);

  const averagePace = calculatePaceSecPerKm(run.movingDurationSec, run.distanceM);
  const maxPace = paceSecPerKmFromSpeed(run.maxSpeedMps); // fastest instant pace, from peak speed

  const { averageGapPace, maxGapPace, gapPoints } = useMemo(() => {
    return {
      averageGapPace: calculateAverageGapPaceSecPerKm(run.trackPoints),
      maxGapPace: calculateMaxGapPaceSecPerKm(run.trackPoints),
      gapPoints: calculateGapPaceSeries(run.trackPoints).map((p) => ({
        x: p.elapsedSec,
        y: p.paceSecPerKm !== null ? Math.min(p.paceSecPerKm, CHART_MAX_PACE_SEC_PER_KM) : null,
      })),
    };
  }, [run.trackPoints]);

  const rawPoints = run.trackPoints
    .slice()
    .sort((a, b) => a.pointIndex - b.pointIndex)
    .map((p) => {
      const pace = paceSecPerKmFromSpeed(p.speedMps);
      return { x: p.elapsedSec, y: pace !== null ? Math.min(pace, CHART_MAX_PACE_SEC_PER_KM) : null };
    });

  const displayedAverage = showGap ? averageGapPace : averagePace;
  const displayedMax = showGap ? maxGapPace : maxPace;
  const displayedPoints = showGap ? gapPoints : rawPoints;

  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-gray-900">Pace</h3>
      <div className="flex items-center justify-between">
        <StatRow
          stats={[
            {
              label: showGap ? "Average GAP" : "Average pace",
              value: displayedAverage !== null ? formatPaceValue(displayedAverage) : "–",
            },
            { label: showGap ? "Max GAP" : "Max pace", value: displayedMax !== null ? formatPaceValue(displayedMax) : "–" },
          ]}
        />
        <Switch checked={showGap} onChange={setShowGap} label="Show Grade Adjusted Pace" />
      </div>
      <div className="mt-3">
        <TrackPointChart
          points={displayedPoints}
          mark="bar"
          color={PACE_COLOR}
          averageValue={displayedAverage !== null ? Math.min(displayedAverage, CHART_MAX_PACE_SEC_PER_KM) : null}
          averageLabel={displayedAverage !== null ? `Avg ${formatMinSec(displayedAverage)}` : undefined}
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
