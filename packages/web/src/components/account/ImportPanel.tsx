import { useRef, useState } from "react";
import { useAccountSummary } from "../../api/useAccount.js";
import { useImportJobStatus, useUploadImport } from "../../api/useImport.js";
import { formatActivityDate } from "@run-review/shared";
import { useToast } from "../common/ToastProvider.js";
import { ImportProgress } from "./ImportProgress.js";
import { ImportSummary } from "./ImportSummary.js";
import { DeleteAllDataModal } from "./DeleteAllDataModal.js";

const MAX_FILE_SIZE_BYTES = 256 * 1024 * 1024;

export function ImportPanel() {
  const { data: summary, isLoading: summaryLoading } = useAccountSummary();
  const uploadImport = useUploadImport();
  const [jobId, setJobId] = useState<string | null>(null);
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();

  const { data: job } = useImportJobStatus(jobId);

  async function handleFileSelected(file: File) {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      showToast("That file is larger than the 256MB import limit", "error");
      return;
    }
    try {
      const result = await uploadImport.mutateAsync(file);
      setJobId(result.importJobId);
    } catch {
      showToast("Could not start the import — please try again", "error");
    }
  }

  function resetToIdle() {
    setJobId(null);
  }

  if (summaryLoading) return null;

  if (job && (job.status === "PENDING" || job.status === "PROCESSING")) {
    return <ImportProgress job={job} />;
  }

  if (job && (job.status === "COMPLETED" || job.status === "FAILED")) {
    return <ImportSummary job={job} onRetry={resetToIdle} onDone={resetToIdle} />;
  }

  const hasData = (summary?.totalRuns ?? 0) > 0;

  return (
    <div className="max-w-sm space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">Running data</h2>
      {hasData ? (
        <>
          <p className="text-sm text-gray-700">
            {summary!.totalRuns} {summary!.totalRuns === 1 ? "run" : "runs"} logged
            {summary!.lastRunDate && ` · Last run: ${formatActivityDate(summary!.lastRunDate)}`}
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadImport.isPending}
              className="rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-purple-700 hover:shadow active:scale-[0.98] active:bg-purple-800 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2"
            >
              Import more data
            </button>
            <button
              type="button"
              onClick={() => setShowDeleteAll(true)}
              className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 active:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
            >
              Delete all running data
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-gray-600">You haven&apos;t added any running data yet.</p>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadImport.isPending}
            className="rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-purple-700 hover:shadow active:scale-[0.98] active:bg-purple-800 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2"
          >
            {uploadImport.isPending ? "Uploading…" : "Import your data"}
          </button>
        </>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileSelected(file);
          e.target.value = "";
        }}
      />
      {showDeleteAll && <DeleteAllDataModal onClose={() => setShowDeleteAll(false)} />}
    </div>
  );
}
