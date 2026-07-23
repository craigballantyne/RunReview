import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ImportJobStatusResponse } from "@run-review/shared";
import { apiClient, uploadImportFile } from "./client.js";
import { ACCOUNT_SUMMARY_KEY, RUNS_LIST_KEY } from "./useRuns.js";

const POLL_INTERVAL_MS = 1500;

export function useUploadImport() {
  return useMutation({
    mutationFn: (file: File) => uploadImportFile(file),
  });
}

export function useImportJobStatus(jobId: string | null) {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ["import", "job", jobId],
    queryFn: () => apiClient.get<ImportJobStatusResponse>(`/import/${jobId}`),
    enabled: jobId !== null,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === "COMPLETED" || status === "FAILED") {
        queryClient.invalidateQueries({ queryKey: RUNS_LIST_KEY });
        queryClient.invalidateQueries({ queryKey: ACCOUNT_SUMMARY_KEY });
        return false;
      }
      return POLL_INTERVAL_MS;
    },
  });
}
