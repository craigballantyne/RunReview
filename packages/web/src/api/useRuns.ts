import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { RunDetail, RunListPage } from "@run-review/shared";
import { apiClient } from "./client.js";

const RUNS_LIST_KEY = ["runs", "list"];
const ACCOUNT_SUMMARY_KEY = ["account", "summary"];

const PAGE_SIZE = 25;

export function useRunsList() {
  return useInfiniteQuery({
    queryKey: RUNS_LIST_KEY,
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      apiClient.get<RunListPage>(`/runs?limit=${PAGE_SIZE}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

export function useRunDetail(runId: string | null) {
  return useQuery({
    queryKey: ["runs", "detail", runId],
    queryFn: () => apiClient.get<RunDetail>(`/runs/${runId}`),
    enabled: runId !== null,
  });
}

export function useDeleteAllRuns() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.delete("/runs"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: RUNS_LIST_KEY });
      queryClient.invalidateQueries({ queryKey: ACCOUNT_SUMMARY_KEY });
    },
  });
}

export { RUNS_LIST_KEY, ACCOUNT_SUMMARY_KEY };
