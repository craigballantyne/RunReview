import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AccountSummary } from "@run-review/shared";
import { apiClient } from "./client.js";
import { ACCOUNT_SUMMARY_KEY } from "./useRuns.js";

export function useAccountSummary() {
  return useQuery({
    queryKey: ACCOUNT_SUMMARY_KEY,
    queryFn: () => apiClient.get<AccountSummary>("/account/summary"),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (vars: { currentPassword: string; newPassword: string; confirmNewPassword: string }) =>
      apiClient.post("/account/password", vars),
  });
}

export function useDeleteAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { currentPassword: string }) => apiClient.delete("/account", vars),
    onSuccess: () => {
      queryClient.setQueryData(["auth", "me"], { user: null });
      queryClient.clear();
    },
  });
}
