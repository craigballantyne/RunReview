import { beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, createElement, type ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useRoutePlan } from "./useRoutePlan.js";
import type { CalculateRouteResult, LatLon, SnapPointResult } from "../api/useRoutePlanner.js";

const snapAsync = vi.hoisted(() => vi.fn());
const routeAsync = vi.hoisted(() => vi.fn());
const showToast = vi.hoisted(() => vi.fn());

vi.mock("../api/useRoutePlanner.js", () => ({
  useSnapPoint: () => ({ mutateAsync: snapAsync, isPending: false }),
  useCalculateRoute: () => ({ mutateAsync: routeAsync, isPending: false }),
}));
vi.mock("../components/common/ToastProvider.js", () => ({ useToast: () => ({ showToast }) }));

/** Snapping is identity here, so assertions read against the coordinates the test supplied. */
function snapsToInput(): void {
  snapAsync.mockImplementation(
    async ({ lat, lon }: LatLon): Promise<SnapPointResult> => ({ lat, lon, location: `loc ${lat},${lon}` }),
  );
}

function routesThrough(): void {
  routeAsync.mockImplementation(
    async (points: LatLon[]): Promise<CalculateRouteResult> => ({
      geometryLatLng: points.map((p) => [p.lat, p.lon] as [number, number]),
      distanceM: points.length * 1000,
      ascentM: 0,
      descentM: 0,
      snappedPoints: points,
      elevationProfile: [],
    }),
  );
}

/** Coordinates as a comparable string, so expectations stay readable. */
const coords = (points: { lat: number; lng: number }[]) => points.map((p) => `${p.lat},${p.lng}`);

/** The app runs under StrictMode, which double-invokes render and state updaters. Tests that don't
 *  match that miss a whole class of double-application bug. */
const strictWrapper = ({ children }: { children: ReactNode }) => createElement(StrictMode, null, children);

async function planWith(...clicks: [number, number][]) {
  const hook = renderHook(() => useRoutePlan(), { wrapper: strictWrapper });
  for (const [lat, lng] of clicks) {
    await act(async () => {
      await hook.result.current.addPoint(lat, lng);
    });
  }
  return hook;
}

beforeEach(() => {
  vi.clearAllMocks();
  snapsToInput();
  routesThrough();
});

describe("undo", () => {
  it("is unavailable until something has happened", async () => {
    const { result } = renderHook(() => useRoutePlan(), { wrapper: strictWrapper });
    expect(result.current.canUndo).toBe(false);
  });

  it("removes a point that was appended", async () => {
    const { result } = await planWith([1, 1], [2, 2], [3, 3]);
    expect(coords(result.current.points)).toEqual(["1,1", "2,2", "3,3"]);

    act(() => result.current.undo());

    expect(coords(result.current.points)).toEqual(["1,1", "2,2"]);
  });

  it("restores a dragged point to where it was", async () => {
    // The previously broken case: undo used to drop the last array element, so dragging the middle
    // point and undoing deleted the final point and left the drag in place.
    const { result } = await planWith([1, 1], [2, 2], [3, 3]);

    await act(async () => {
      await result.current.movePoint(1, 9, 9);
    });
    expect(coords(result.current.points)).toEqual(["1,1", "9,9", "3,3"]);

    act(() => result.current.undo());

    expect(coords(result.current.points)).toEqual(["1,1", "2,2", "3,3"]);
  });

  it("removes an inserted midpoint rather than the final point", async () => {
    // The other broken case: inserting at index 1 then undoing used to remove the *last* point,
    // leaving the inserted one behind.
    const { result } = await planWith([1, 1], [2, 2]);

    await act(async () => {
      await result.current.insertPoint(1, 5, 5);
    });
    expect(coords(result.current.points)).toEqual(["1,1", "5,5", "2,2"]);

    act(() => result.current.undo());

    expect(coords(result.current.points)).toEqual(["1,1", "2,2"]);
  });

  it("steps back through several actions in order", async () => {
    const { result } = await planWith([1, 1], [2, 2]);
    await act(async () => {
      await result.current.insertPoint(1, 5, 5);
    });
    await act(async () => {
      await result.current.movePoint(0, 7, 7);
    });

    expect(coords(result.current.points)).toEqual(["7,7", "5,5", "2,2"]);
    act(() => result.current.undo());
    expect(coords(result.current.points)).toEqual(["1,1", "5,5", "2,2"]);
    act(() => result.current.undo());
    expect(coords(result.current.points)).toEqual(["1,1", "2,2"]);
    act(() => result.current.undo());
    expect(coords(result.current.points)).toEqual(["1,1"]);
  });

  it("records exactly one step for a point edit", async () => {
    // Two adds plus one move is three actions, so three undos reach the empty state. A fourth
    // undo having any effect would mean the optimistic update and the route recalculation were
    // each being recorded separately.
    const { result } = await planWith([1, 1], [2, 2]);
    await act(async () => {
      await result.current.movePoint(1, 9, 9);
    });

    act(() => result.current.undo());
    expect(coords(result.current.points)).toEqual(["1,1", "2,2"]);
    act(() => result.current.undo());
    expect(coords(result.current.points)).toEqual(["1,1"]);
    act(() => result.current.undo());
    expect(result.current.points).toEqual([]);
    expect(result.current.canUndo).toBe(false);
  });

  it("records exactly one step for a midpoint insert", async () => {
    const { result } = await planWith([1, 1], [2, 2]);
    await act(async () => {
      await result.current.insertPoint(1, 5, 5);
    });

    act(() => result.current.undo());
    expect(coords(result.current.points)).toEqual(["1,1", "2,2"]);
    act(() => result.current.undo());
    expect(coords(result.current.points)).toEqual(["1,1"]);
    act(() => result.current.undo());
    expect(result.current.points).toEqual([]);
    expect(result.current.canUndo).toBe(false);
  });

  it("undoes a completed loop", async () => {
    const { result } = await planWith([1, 1], [2, 2]);

    await act(async () => {
      await result.current.completeLoop();
    });
    expect(coords(result.current.points)).toEqual(["1,1", "2,2", "1,1"]);

    act(() => result.current.undo());
    expect(coords(result.current.points)).toEqual(["1,1", "2,2"]);
  });

  it("undoes clearing the route", async () => {
    // Clearing by accident is exactly when someone reaches for undo.
    const { result } = await planWith([1, 1], [2, 2]);

    act(() => result.current.clear());
    expect(result.current.points).toEqual([]);

    act(() => result.current.undo());
    expect(coords(result.current.points)).toEqual(["1,1", "2,2"]);
    expect(result.current.startLocation).toBe("loc 1,1");
  });

  it("restores the route geometry and stats, not just the points", async () => {
    const { result } = await planWith([1, 1], [2, 2], [3, 3]);
    const distanceBefore = result.current.stats.distanceM;

    await act(async () => {
      await result.current.addPoint(4, 4);
    });
    expect(result.current.stats.distanceM).not.toBe(distanceBefore);

    act(() => result.current.undo());

    expect(result.current.stats.distanceM).toBe(distanceBefore);
    expect(result.current.routeGeometry).toHaveLength(3);
  });

  it("runs back to the empty state and then stops", async () => {
    const { result } = await planWith([1, 1]);

    act(() => result.current.undo());
    expect(result.current.points).toEqual([]);
    expect(result.current.canUndo).toBe(false);

    // Undoing past the beginning must be inert rather than throwing.
    act(() => result.current.undo());
    expect(result.current.points).toEqual([]);
  });

  describe("failed actions", () => {
    it("leaves nothing to undo when a drag could not be snapped", async () => {
      const { result } = await planWith([1, 1], [2, 2]);
      snapAsync.mockRejectedValueOnce(new Error("no road there"));

      await act(async () => {
        await result.current.movePoint(1, 9, 9);
      });

      await waitFor(() => expect(showToast).toHaveBeenCalled());
      expect(coords(result.current.points)).toEqual(["1,1", "2,2"]);

      // The failed drag must not have left a history entry. If it had, this undo would restore the
      // identical state and appear to do nothing; stepping back to the previous point proves the
      // stack only records changes that actually happened.
      act(() => result.current.undo());
      expect(coords(result.current.points)).toEqual(["1,1"]);
    });

    it("leaves nothing to undo when a route could not be calculated", async () => {
      const { result } = await planWith([1, 1], [2, 2]);
      routeAsync.mockRejectedValueOnce(new Error("unroutable"));

      await act(async () => {
        await result.current.addPoint(3, 3);
      });

      await waitFor(() => expect(showToast).toHaveBeenCalled());
      expect(coords(result.current.points)).toEqual(["1,1", "2,2"]);

      act(() => result.current.undo());
      expect(coords(result.current.points)).toEqual(["1,1"]);
    });
  });
});
