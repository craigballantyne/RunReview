import { useMutation, useQuery } from "@tanstack/react-query";
import { apiClient } from "./client.js";

export interface LatLon {
  lat: number;
  lon: number;
}

export interface SnapStartPointResult {
  lat: number;
  lon: number;
  location: string | null;
}

export interface CalculateRouteResult {
  geometryLatLng: [number, number][];
  distanceM: number;
  ascentM: number;
  descentM: number;
  snappedPoints: LatLon[];
}

export function useSnapStartPoint() {
  return useMutation({
    mutationFn: (point: LatLon) => apiClient.post<SnapStartPointResult>("/route-planner/snap", point),
  });
}

export function useCalculateRoute() {
  return useMutation({
    mutationFn: (points: LatLon[]) => apiClient.post<CalculateRouteResult>("/route-planner/route", { points }),
  });
}

export function useHeatmapPoints(enabled: boolean) {
  return useQuery({
    queryKey: ["route-planner", "heatmap"],
    queryFn: () => apiClient.get<{ points: [number, number][] }>("/route-planner/heatmap"),
    enabled,
  });
}
