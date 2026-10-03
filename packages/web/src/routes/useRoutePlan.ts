import { useCallback, useRef, useState } from "react";
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

/**
 * Everything an undo has to put back.
 *
 * The derived state (geometry, stats, elevation) is snapshotted alongside the points rather than
 * recalculated on undo. That makes undo instant, offline, and incapable of failing — recalculating
 * would mean a round trip that can error, which is a poor property for the action users reach for
 * precisely when something has gone wrong.
 */
interface RouteSnapshot {
  points: RoutePoint[];
  startLocation: string | null;
  routeGeometry: RoutePoint[];
  stats: RouteStats;
  elevationProfile: ElevationPoint[];
}

/** Deep enough to cover any plausible run of mistakes, shallow enough not to grow unbounded. */
const HISTORY_LIMIT = 50;

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
  const [history, setHistory] = useState<RouteSnapshot[]>([]);

  const snapMutation = useSnapPoint();
  const routeMutation = useCalculateRoute();
  const { showToast } = useToast();

  // A render-time mirror of current state. Actions capture their "before" snapshot from this rather
  // than from their own closures, which keeps every action's dependency list from having to name
  // all five pieces of state — and removes the risk of one of them going stale.
  const snapshotRef = useRef<RouteSnapshot>({
    points: [],
    startLocation: null,
    routeGeometry: [],
    stats: ZERO_STATS,
    elevationProfile: [],
  });
  snapshotRef.current = { points, startLocation, routeGeometry, stats, elevationProfile };

  const pushHistory = useCallback(() => {
    const snapshot = snapshotRef.current;
    setHistory((prev) => [...prev, snapshot].slice(-HISTORY_LIMIT));
  }, []);

  /** Discards the pending history entry when an action turned out not to change anything. */
  const popHistory = useCallback(() => {
    setHistory((prev) => prev.slice(0, -1));
  }, []);

  // Recalculates the whole route from an ordered point list — used for every add/undo/loop
  // action. Repositions `points` to the response's snapped coordinates (not the raw clicks), so
  // markers stay visually consistent with the drawn line. Reports whether it succeeded, so callers
  // can tell a real change from a no-op and keep the history stack honest.
  const recalculate = useCallback(
    async (nextPoints: RoutePoint[]): Promise<boolean> => {
      try {
        const result = await routeMutation.mutateAsync(nextPoints.map(toLatLon));
        setRouteGeometry(result.geometryLatLng.map(([lat, lng]) => ({ lat, lng })));
        setStats({ distanceM: result.distanceM, ascentM: result.ascentM, descentM: result.descentM });
        setPoints(result.snappedPoints.map(toRoutePoint));
        setElevationProfile(result.elevationProfile);
        return true;
      } catch {
        showToast("Couldn't calculate that route — try adjusting your points", "error");
        return false;
      }
    },
    [routeMutation, showToast],
  );

  const addFirstPoint = useCallback(
    async (lat: number, lng: number): Promise<boolean> => {
      try {
        const result = await snapMutation.mutateAsync({ lat, lon: lng });
        setPoints([{ lat: result.lat, lng: result.lon }]);
        setStartLocation(result.location);
        return true;
      } catch {
        showToast("Couldn't place a start point there — try again", "error");
        return false;
      }
    },
    [snapMutation, showToast],
  );

  const addPoint = useCallback(
    async (lat: number, lng: number) => {
      pushHistory();
      const ok =
        points.length === 0 ? await addFirstPoint(lat, lng) : await recalculate([...points, { lat, lng }]);
      if (!ok) popHistory();
    },
    [points, addFirstPoint, recalculate, pushHistory, popHistory],
  );

  /**
   * Steps back to the state before the last action, whatever that action was.
   *
   * Previously this dropped the final point in the array, which is only the inverse of an *append*.
   * After a drag-edit it deleted an unrelated point, and after a mid-route insert it removed the
   * wrong one entirely — the inverse of an action can't be inferred from the resulting array, so
   * the state before it is recorded instead.
   */
  const undo = useCallback(() => {
    const previous = history[history.length - 1];
    if (!previous) return;

    setHistory((prev) => prev.slice(0, -1));
    setPoints(previous.points);
    setStartLocation(previous.startLocation);
    setRouteGeometry(previous.routeGeometry);
    setStats(previous.stats);
    setElevationProfile(previous.elevationProfile);
  }, [history]);

  const completeLoop = useCallback(async () => {
    if (points.length <= 1) return;
    pushHistory();
    if (!(await recalculate([...points, points[0]!]))) popHistory();
  }, [points, recalculate, pushHistory, popHistory]);

  // Repositions an existing point (drag-and-drop) — snaps the new position to the nearest
  // road/path, then recalculates the route through the updated point set. Moving the start point
  // (index 0) also re-resolves its label, matching addFirstPoint's behavior; any other point only
  // needs snapping (includeLocation: false skips the unnecessary geocode call).
  const movePoint = useCallback(
    async (index: number, lat: number, lng: number) => {
      if (index === 0 && points.length <= 1) {
        pushHistory();
        if (!(await addFirstPoint(lat, lng))) popHistory();
        return;
      }

      // Optimistic update: since `position` is a controlled prop on the marker, leaving `points`
      // unchanged until the snap/recalculate round-trip resolves means the marker briefly
      // reverts to its pre-drag position on every render in between — visible as a snap-back
      // flicker right after the user drops it. Placing it at the dropped coordinates immediately
      // (then reconciling with the server's snapped position once it arrives) avoids that.
      const previousPoints = points;
      const optimisticPoints = points.map((p, i) => (i === index ? { lat, lng } : p));
      pushHistory();
      setPoints(optimisticPoints);

      try {
        const result = await snapMutation.mutateAsync({ lat, lon: lng, includeLocation: index === 0 });
        if (index === 0) {
          setStartLocation(result.location);
        }
        const nextPoints = optimisticPoints.map((p, i) => (i === index ? { lat: result.lat, lng: result.lon } : p));
        await recalculate(nextPoints);
      } catch {
        // Rolled all the way back, so there is nothing left to undo.
        setPoints(previousPoints);
        popHistory();
        showToast("Couldn't move that point there — try again", "error");
      }
    },
    [points, addFirstPoint, snapMutation, recalculate, showToast, pushHistory, popHistory],
  );

  // Inserts a new point into the middle of the route (mid-route click/click-and-drag) at the
  // given index — always index 1..points.length-1, never the start point, so no location label
  // to re-resolve. Same optimistic-update-then-reconcile shape as movePoint, for the same reason
  // (avoids the new marker flickering back out before the snap/recalculate round-trip resolves).
  const insertPoint = useCallback(
    async (index: number, lat: number, lng: number) => {
      const previousPoints = points;
      const optimisticPoints = [...points.slice(0, index), { lat, lng }, ...points.slice(index)];
      pushHistory();
      setPoints(optimisticPoints);

      try {
        const result = await snapMutation.mutateAsync({ lat, lon: lng, includeLocation: false });
        const nextPoints = [...optimisticPoints.slice(0, index), { lat: result.lat, lng: result.lon }, ...optimisticPoints.slice(index + 1)];
        await recalculate(nextPoints);
      } catch {
        setPoints(previousPoints);
        popHistory();
        showToast("Couldn't add a point there — try again", "error");
      }
    },
    [points, snapMutation, recalculate, showToast, pushHistory, popHistory],
  );

  // Undoable like any other action — clearing a route by accident is exactly the case where
  // reaching for undo is the natural reaction.
  const clear = useCallback(() => {
    pushHistory();
    setPoints([]);
    setStartLocation(null);
    setRouteGeometry([]);
    setStats(ZERO_STATS);
    setElevationProfile([]);
  }, [pushHistory]);

  return {
    points,
    startLocation,
    routeGeometry,
    stats,
    elevationProfile,
    isCalculating: snapMutation.isPending || routeMutation.isPending,
    canUndo: history.length > 0,
    addPoint,
    movePoint,
    insertPoint,
    undo,
    completeLoop,
    clear,
  };
}

export type RoutePlan = ReturnType<typeof useRoutePlan>;
