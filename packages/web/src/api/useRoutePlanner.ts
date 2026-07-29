import { useMutation, useQuery } from "@tanstack/react-query";
import { apiClient } from "./client.js";

export interface LatLon {
  lat: number;
  lon: number;
}

export interface SnapPointResult {
  lat: number;
  lon: number;
  location: string | null;
}

export interface ElevationPoint {
  distanceM: number;
  elevationM: number;
}

export interface CalculateRouteResult {
  geometryLatLng: [number, number][];
  distanceM: number;
  ascentM: number;
  descentM: number;
  snappedPoints: LatLon[];
  elevationProfile: ElevationPoint[];
}

export function useSnapPoint() {
  return useMutation({
    mutationFn: (point: LatLon & { includeLocation?: boolean }) =>
      apiClient.post<SnapPointResult>("/route-planner/snap", point),
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
