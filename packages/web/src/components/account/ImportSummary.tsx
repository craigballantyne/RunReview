import { useState } from "react";
import type { ImportJobStatusResponse } from "@run-review/shared";

interface ImportSummaryProps {
  job: ImportJobStatusResponse;
  onRetry: () => void;
  onDone: () => void;
}

export function ImportSummary({ job, onRetry, onDone }: ImportSummaryProps) {
  const [expanded, setExpanded] = useState(false);

  if (job.status === "FAILED") {
    return (
      <div className="max-w-sm space-y-3">
        <p className="text-sm text-red-600">{job.errorMessage ?? "The import failed."}</p>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-sm space-y-3">
      <p className="text-sm text-gray-700">
        Imported <strong>{job.importedCount}</strong> {job.importedCount === 1 ? "run" : "runs"}
        {job.skippedCount > 0 && (
          <>
            , skipped <strong>{job.skippedCount}</strong>
          </>
        )}
        .
      </p>
      {job.skippedCount > 0 && job.skippedDetails && (
        <div>
          <button type="button" onClick={() => setExpanded((v) => !v)} className="text-sm text-gray-500 underline">
            {expanded ? "Hide skipped activities" : "Show skipped activities"}
          </button>
          {expanded && (
            <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-md bg-gray-50 p-3 text-xs text-gray-600">
              {job.skippedDetails.map((detail, i) => (
                <li key={i}>
                  {detail.activityName ?? "Unknown activity"} — {detail.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={onDone}
        className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
      >
        Done
      </button>
    </div>
  );
}
