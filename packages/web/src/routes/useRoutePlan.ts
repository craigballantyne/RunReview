import { useCallback, useState } from "react";
import { useCalculateRoute, useSnapStartPoint, type LatLon } from "../api/useRoutePlanner.js";
import { useToast } from "../components/common/ToastProvider.js";

export interface RoutePoint {
  lat: number;
  lng: number;
}

interface RouteStats {
  distanceM: number;
  ascentM: number;
  descentM: number;
}

const ZERO_STATS: RouteStats = { distanceM: 0, ascentM: 0, descentM: 0 };

function toLatLon(p: RoutePoint): LatLon {
  return { lat: p.lat, lon: p.lng };
}

function toRoutePoint(p: LatLon): RoutePoint {
  return { lat: p.lat, lng: p.lon };
}

export function useRoutePlan() {
  const [points, setPoints] = useState<RoutePoint[]>([]);
  const [startLocation, setStartLocation] = useState<string | null>(null);
  const [routeGeometry, setRouteGeometry] = useState<RoutePoint[]>([]);
  const [stats, setStats] = useState<RouteStats>(ZERO_STATS);

  const snapMutation = useSnapStartPoint();
  const routeMutation = useCalculateRoute();
  const { showToast } = useToast();

  // Recalculates the whole route from an ordered point list — used for every add/undo/loop
  // action. Repositions `points` to the response's snapped coordinates (not the raw clicks), so
  // markers stay visually consistent with the drawn line.
  const recalculate = useCallback(
    async (nextPoints: RoutePoint[]) => {
      try {
        const result = await routeMutation.mutateAsync(nextPoints.map(toLatLon));
        setRouteGeometry(result.geometryLatLng.map(([lat, lng]) => ({ lat, lng })));
        setStats({ distanceM: result.distanceM, ascentM: result.ascentM, descentM: result.descentM });
        setPoints(result.snappedPoints.map(toRoutePoint));
      } catch {
        showToast("Couldn't calculate that route — try adjusting your points", "error");
      }
    },
    [routeMutation, showToast],
  );

  const addFirstPoint = useCallback(
    async (lat: number, lng: number) => {
      try {
        const result = await snapMutation.mutateAsync({ lat, lon: lng });
        setPoints([{ lat: result.lat, lng: result.lon }]);
        setStartLocation(result.location);
      } catch {
        showToast("Couldn't place a start point there — try again", "error");
      }
    },
    [snapMutation, showToast],
  );

  const addPoint = useCallback(
    async (lat: number, lng: number) => {
      if (points.length === 0) {
        await addFirstPoint(lat, lng);
        return;
      }
      await recalculate([...points, { lat, lng }]);
    },
    [points, addFirstPoint, recalculate],
  );

  const undo = useCallback(async () => {
    if (points.length <= 1) return;
    const next = points.slice(0, -1);
    if (next.length === 1) {
      setPoints(next);
      setRouteGeometry([]);
      setStats(ZERO_STATS);
      return;
    }
    await recalculate(next);
  }, [points, recalculate]);

  const completeLoop = useCallback(async () => {
    if (points.length <= 1) return;
    await recalculate([...points, points[0]!]);
  }, [points, recalculate]);

  const clear = useCallback(() => {
    setPoints([]);
    setStartLocation(null);
    setRouteGeometry([]);
    setStats(ZERO_STATS);
  }, []);

  return {
    points,
    startLocation,
    routeGeometry,
    stats,
    isCalculating: snapMutation.isPending || routeMutation.isPending,
    addPoint,
    undo,
    completeLoop,
    clear,
  };
}

export type RoutePlan = ReturnType<typeof useRoutePlan>;
