import type { RunListItem } from "@run-review/shared";
import { formatActivityDate, formatDistanceKm, formatDuration, formatPace } from "@run-review/shared";

interface ActivityCardProps {
  run: RunListItem;
  isSelected: boolean;
  onSelect: () => void;
}

export function ActivityCard({ run, isSelected, onSelect }: ActivityCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-lg border p-4 text-left transition-colors ${
        isSelected ? "border-gray-900 bg-gray-50" : "border-gray-200 bg-white hover:border-gray-300"
      }`}
    >
      <h3 className="font-medium text-gray-900">{run.activityName}</h3>
      <p className="mt-0.5 text-sm text-gray-500">
        {formatActivityDate(run.startTimeLocal)}
        {run.location ? ` · ${run.location}` : ""}
      </p>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
        <div>
          <dt className="text-gray-400">Distance</dt>
          <dd className="font-medium text-gray-800">{formatDistanceKm(run.distanceM)}</dd>
        </div>
        <div>
          <dt className="text-gray-400">Pace</dt>
          <dd className="font-medium text-gray-800">{formatPace(run.movingDurationSec, run.distanceM)}</dd>
        </div>
        <div>
          <dt className="text-gray-400">Time</dt>
          <dd className="font-medium text-gray-800">{formatDuration(run.movingDurationSec)}</dd>
        </div>
      </dl>
    </button>
  );
}
