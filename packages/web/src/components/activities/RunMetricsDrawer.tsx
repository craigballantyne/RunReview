import { useEffect } from "react";
import { createPortal } from "react-dom";
import { formatActivityDate, formatDistanceKm, formatDuration, formatPace } from "@run-review/shared";
import { useRunDetail } from "../../api/useRuns.js";
import { StatRow } from "./charts/StatRow.js";
import { WeatherSummary } from "./WeatherSummary.js";
import { PaceSection } from "./charts/PaceSection.js";
import { HeartRateSection } from "./charts/HeartRateSection.js";
import { HeartRateZonesSection } from "./charts/HeartRateZonesSection.js";
import { ElevationSection } from "./charts/ElevationSection.js";

interface RunMetricsDrawerProps {
  runId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export function RunMetricsDrawer({ runId, isOpen, onClose }: RunMetricsDrawerProps) {
  const { data: run } = useRunDetail(runId);

  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!runId) return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-[2000] transition-opacity duration-300 ${
        isOpen ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Run metrics"
        style={{ height: "90vh", width: "60vw" }}
        className={`absolute bottom-0 left-1/2 -translate-x-1/2 flex flex-col rounded-t-xl bg-white shadow-2xl transition-transform duration-300 ${
          isOpen ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white text-gray-400 shadow-sm hover:bg-gray-100 hover:text-gray-600"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-5 w-5">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>

        {run && (
          <div className="overflow-y-auto p-6">
            <h2 className="pr-10 text-lg font-semibold text-gray-900">{run.activityName}</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              {formatActivityDate(run.startTimeLocal)}
              {run.location ? ` · ${run.location}` : ""}
            </p>

            {run.weather && (
              <div className="mt-3">
                <WeatherSummary weather={run.weather} />
              </div>
            )}

            <div className="mt-4">
              <StatRow
                stats={[
                  { label: "Distance", value: formatDistanceKm(run.distanceM) },
                  { label: "Pace", value: formatPace(run.movingDurationSec, run.distanceM) },
                  { label: "Time", value: formatDuration(run.movingDurationSec) },
                  { label: "Calories", value: run.calories !== null ? `${Math.round(run.calories)} kcal` : "–" },
                  { label: "Avg HR", value: run.avgHr !== null ? `${run.avgHr} bpm` : "–" },
                ]}
              />
            </div>

            <div className="mt-8 space-y-8">
              <PaceSection run={run} />
              <HeartRateSection run={run} />
              <HeartRateZonesSection run={run} />
              <ElevationSection run={run} />
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
