import { useQuery } from "@tanstack/react-query";
import type { DistanceRecord } from "@run-review/shared";
import { apiClient } from "./client.js";

export const RECORDS_KEY = ["records"];

export function useRecords() {
  return useQuery({
    queryKey: RECORDS_KEY,
    queryFn: () => apiClient.get<{ distances: DistanceRecord[] }>("/records"),
  });
}
