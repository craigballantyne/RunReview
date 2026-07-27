import { useRunDetail } from "../../api/useRuns.js";
import { WeatherSummary } from "./WeatherSummary.js";

interface WeatherPanelProps {
  runId: string | null;
}

export function WeatherPanel({ runId }: WeatherPanelProps) {
  const { data: run } = useRunDetail(runId);
  if (!run?.weather) return null;

  return (
    <div className="absolute bottom-3 left-3 z-[1000] rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-md">
      <WeatherSummary weather={run.weather} />
    </div>
  );
}
