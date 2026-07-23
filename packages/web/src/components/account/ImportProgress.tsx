import type { ImportJobStatusResponse } from "@run-review/shared";

export function ImportProgress({ job }: { job: ImportJobStatusResponse }) {
  const pct =
    job.totalActivities && job.totalActivities > 0
      ? Math.min(100, Math.round((job.processedActivities / job.totalActivities) * 100))
      : null;

  return (
    <div className="max-w-sm space-y-2">
      <p className="text-sm text-gray-700">
        Importing your activities…{" "}
        {job.totalActivities ? `${job.processedActivities} of ${job.totalActivities}` : `${job.processedActivities} processed`}
      </p>
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
        <div
          className="h-full bg-gray-900 transition-all"
          style={{ width: pct !== null ? `${pct}%` : "35%" }}
        />
      </div>
    </div>
  );
}
