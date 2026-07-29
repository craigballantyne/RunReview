import { useCallback, useState } from "react";
import { useCalculateRoute, useSnapPoint, type ElevationPoint, type LatLon } from "../api/useRoutePlanner.js";
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
  const [elevationProfile, setElevationProfile] = useState<ElevationPoint[]>([]);

  const snapMutation = useSnapPoint();
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
        setElevationProfile(result.elevationProfile);
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
      setElevationProfile([]);
      return;
    }
    await recalculate(next);
  }, [points, recalculate]);

  const completeLoop = useCallback(async () => {
    if (points.length <= 1) return;
    await recalculate([...points, points[0]!]);
  }, [points, recalculate]);

  // Repositions an existing point (drag-and-drop) — snaps the new position to the nearest
  // road/path, then recalculates the route through the updated point set. Moving the start point
  // (index 0) also re-resolves its label, matching addFirstPoint's behavior; any other point only
  // needs snapping (includeLocation: false skips the unnecessary geocode call).
  const movePoint = useCallback(
    async (index: number, lat: number, lng: number) => {
      if (index === 0 && points.length <= 1) {
        await addFirstPoint(lat, lng);
        return;
      }

      // Optimistic update: since `position` is a controlled prop on the marker, leaving `points`
      // unchanged until the snap/recalculate round-trip resolves means the marker briefly
      // reverts to its pre-drag position on every render in between — visible as a snap-back
      // flicker right after the user drops it. Placing it at the dropped coordinates immediately
      // (then reconciling with the server's snapped position once it arrives) avoids that.
      const previousPoints = points;
      const optimisticPoints = points.map((p, i) => (i === index ? { lat, lng } : p));
      setPoints(optimisticPoints);

      try {
        const result = await snapMutation.mutateAsync({ lat, lon: lng, includeLocation: index === 0 });
        if (index === 0) {
          setStartLocation(result.location);
        }
        const nextPoints = optimisticPoints.map((p, i) => (i === index ? { lat: result.lat, lng: result.lon } : p));
        await recalculate(nextPoints);
      } catch {
        setPoints(previousPoints);
        showToast("Couldn't move that point there — try again", "error");
      }
    },
    [points, addFirstPoint, snapMutation, recalculate, showToast],
  );

  // Inserts a new point into the middle of the route (mid-route click/click-and-drag) at the
  // given index — always index 1..points.length-1, never the start point, so no location label
  // to re-resolve. Same optimistic-update-then-reconcile shape as movePoint, for the same reason
  // (avoids the new marker flickering back out before the snap/recalculate round-trip resolves).
  const insertPoint = useCallback(
    async (index: number, lat: number, lng: number) => {
      const previousPoints = points;
      const optimisticPoints = [...points.slice(0, index), { lat, lng }, ...points.slice(index)];
      setPoints(optimisticPoints);

      try {
        const result = await snapMutation.mutateAsync({ lat, lon: lng, includeLocation: false });
        const nextPoints = [...optimisticPoints.slice(0, index), { lat: result.lat, lng: result.lon }, ...optimisticPoints.slice(index + 1)];
        await recalculate(nextPoints);
      } catch {
        setPoints(previousPoints);
        showToast("Couldn't add a point there — try again", "error");
      }
    },
    [points, snapMutation, recalculate, showToast],
  );

  const clear = useCallback(() => {
    setPoints([]);
    setStartLocation(null);
    setRouteGeometry([]);
    setStats(ZERO_STATS);
    setElevationProfile([]);
  }, []);

  return {
    points,
    startLocation,
    routeGeometry,
    stats,
    elevationProfile,
    isCalculating: snapMutation.isPending || routeMutation.isPending,
    addPoint,
    movePoint,
    insertPoint,
    undo,
    completeLoop,
    clear,
  };
}

export type RoutePlan = ReturnType<typeof useRoutePlan>;
