import { useState } from "react";
import { formatDistanceKm } from "@run-review/shared";
import { ConfirmModal } from "../common/ConfirmModal.js";
import { StatRow } from "../activities/charts/StatRow.js";
import { TrackPointChart } from "../activities/charts/TrackPointChart.js";
import type { RoutePlan } from "../../routes/useRoutePlan.js";

interface RoutePlannerSidebarProps {
  plan: RoutePlan;
}

const ELEVATION_COLOR = "#16a34a"; // green-600 — matches ElevationSection.tsx's run elevation chart

function formatMeters(value: number): string {
  return `${Math.round(value)} m`;
}

export function RoutePlannerSidebar({ plan }: RoutePlannerSidebarProps) {
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const { points, startLocation, stats, elevationProfile, undo, completeLoop, clear } = plan;

  if (points.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <p className="text-sm text-gray-600">Click the map to choose your starting point.</p>
      </div>
    );
  }

  const hasMultiplePoints = points.length > 1;

  return (
    <div className="flex h-full flex-col overflow-y-auto p-6">
      <h2 className="text-lg font-semibold text-gray-900">Running from {startLocation ?? "your starting point"}</h2>

      <div className="mt-4">
        <StatRow
          stats={[
            { label: "Distance", value: formatDistanceKm(stats.distanceM) },
            { label: "Ascent", value: formatMeters(stats.ascentM) },
            { label: "Descent", value: formatMeters(stats.descentM) },
          ]}
        />
      </div>

      {elevationProfile.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-2 text-sm font-semibold text-gray-900">Elevation</h3>
          <TrackPointChart
            points={elevationProfile.map((p) => ({ x: p.distanceM, y: p.elevationM }))}
            mark="area"
            color={ELEVATION_COLOR}
            xTickFormat={formatDistanceKm}
            yTickFormat={(v) => `${Math.round(v)}m`}
            tooltipValueFormat={(v) => `${Math.round(v)} m`}
          />
        </div>
      )}

      <div className="mt-auto space-y-2 pt-6">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => void undo()}
            disabled={!hasMultiplePoints}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Undo
          </button>
          <button
            type="button"
            onClick={() => void completeLoop()}
            disabled={!hasMultiplePoints}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Complete loop
          </button>
        </div>
        <button
          type="button"
          onClick={() => setShowClearConfirm(true)}
          className="w-full rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
        >
          Clear route
        </button>
      </div>

      {showClearConfirm && (
        <ConfirmModal
          title="Clear route?"
          description="This will remove your entire planned route, including the start location."
          confirmLabel="Clear route"
          onConfirm={() => {
            clear();
            setShowClearConfirm(false);
          }}
          onCancel={() => setShowClearConfirm(false)}
        />
      )}
    </div>
  );
}
