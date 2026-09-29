import { Link } from "react-router-dom";
import type { DistanceCategory, DistanceRecord } from "@run-review/shared";
import { formatActivityDate, formatDuration } from "@run-review/shared";
import { useRecords } from "../api/useRecords.js";

const COLUMNS: { category: DistanceCategory; heading: string }[] = [
  { category: "km", heading: "Kilometres" },
  { category: "mi", heading: "Miles" },
  { category: "race", heading: "Race distances" },
];

/** Colours the top three so the fastest reads as the record without needing a label. */
const RANK_STYLES = [
  "bg-amber-50 text-amber-900 ring-1 ring-inset ring-amber-200",
  "bg-gray-50 text-gray-800",
  "bg-gray-50 text-gray-800",
];

function DistanceCard({ record }: { record: DistanceRecord }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h3 className="text-center text-xl font-semibold tracking-tight text-gray-900">{record.label}</h3>

      <ol className="mt-3 space-y-1.5">
        {record.entries.map((entry, index) => (
          <li
            key={entry.runId}
            className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 ${RANK_STYLES[index] ?? RANK_STYLES[2]}`}
          >
            <span className="flex items-baseline gap-2">
              <span className="w-3 shrink-0 text-xs font-medium tabular-nums text-gray-400">{index + 1}</span>
              <span className="text-base font-semibold tabular-nums">{formatDuration(entry.durationSec)}</span>
            </span>
            <Link
              to={`/activities/${entry.runId}`}
              title={entry.activityName}
              className="shrink-0 text-xs text-gray-500 underline-offset-2 transition-colors hover:text-purple-600 hover:underline"
            >
              {formatActivityDate(entry.startTimeLocal)}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function RecordsPage() {
  const { data, isLoading, isError } = useRecords();

  if (isLoading) {
    return <p className="p-8 text-center text-sm text-gray-500">Loading records…</p>;
  }
  if (isError) {
    return <p className="p-8 text-center text-sm text-gray-500">Couldn&rsquo;t load your records.</p>;
  }

  const distances = data?.distances ?? [];

  if (distances.length === 0) {
    return (
      <div className="p-8 text-center">
        <h1 className="text-xl font-semibold text-gray-900">Records</h1>
        <p className="mt-2 text-sm text-gray-500">
          No records yet — import some runs and run an analysis pass to see your fastest efforts here.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Records</h1>
        <p className="mt-1 text-sm text-gray-500">
          Your three fastest efforts at each distance, found anywhere within a run — not just runs of that
          exact length.
        </p>

        <div className="mt-6 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {COLUMNS.map((column) => {
            const columnRecords = distances.filter((d) => d.category === column.category);
            // A column with nothing in it is dropped rather than left as an empty heading — most
            // athletes will have no marathon record for a long time.
            if (columnRecords.length === 0) return null;

            return (
              <div key={column.category}>
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">{column.heading}</h2>
                <div className="space-y-4">
                  {columnRecords.map((record) => (
                    <DistanceCard key={record.distanceM} record={record} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
