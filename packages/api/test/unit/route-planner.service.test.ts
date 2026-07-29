import { describe, expect, it, vi } from "vitest";
import { createRoutePlannerService } from "../../src/modules/route-planner/route-planner.service.js";
import type { RouteResult, RouteService } from "../../src/modules/route-planner/openroute.js";
import type { Geocoder } from "../../src/modules/import/geocode.js";

function createFakePrisma(trackPoints: Array<{ latitude: number | null; longitude: number | null }>) {
  return {
    trackPoint: {
      findMany: vi.fn(async () => trackPoints),
    },
  };
}

describe("createRoutePlannerService.getHeatmapPoints", () => {
  it("maps track point rows to [lat, lng] tuples, filtering out any remaining nulls defensively", async () => {
    const prisma = createFakePrisma([
      { latitude: 55.95, longitude: -3.19 },
      { latitude: null, longitude: null }, // shouldn't happen given the DB filter, but guarded anyway
      { latitude: 55.96, longitude: -3.18 },
    ]);
    const routeService = { snapToRoad: vi.fn(), calculateRoute: vi.fn() } satisfies RouteService;
    const geocoder = { reverseGeocode: vi.fn(), reverseGeocodeStreet: vi.fn() } satisfies Geocoder;

    const service = createRoutePlannerService({ prisma: prisma as never, routeService, geocoder });
    const points = await service.getHeatmapPoints("user-1");

    expect(points).toEqual([
      [55.95, -3.19],
      [55.96, -3.18],
    ]);
    expect(prisma.trackPoint.findMany).toHaveBeenCalledWith({
      where: { run: { userId: "user-1" }, latitude: { not: null }, longitude: { not: null } },
      select: { latitude: true, longitude: true },
    });
  });
});

describe("createRoutePlannerService.snapPoint", () => {
  it("snaps the point and resolves a street-level location label when includeLocation is true", async () => {
    const routeService = {
      snapToRoad: vi.fn(async () => ({ lat: 55.95, lon: -3.19 })),
      calculateRoute: vi.fn(),
    } satisfies RouteService;
    const geocoder = {
      reverseGeocode: vi.fn(),
      reverseGeocodeStreet: vi.fn(async () => "Royal Mile"),
    } satisfies Geocoder;

    const service = createRoutePlannerService({ prisma: {} as never, routeService, geocoder });
    const result = await service.snapPoint(55.9533, -3.1883, true);

    expect(result).toEqual({ lat: 55.95, lon: -3.19, location: "Royal Mile" });
    expect(geocoder.reverseGeocodeStreet).toHaveBeenCalledWith(55.95, -3.19); // geocodes the SNAPPED point, not the raw click
    expect(geocoder.reverseGeocode).not.toHaveBeenCalled(); // uses the street-level lookup, not the locality one
  });

  it("skips the geocode lookup entirely when includeLocation is false", async () => {
    const routeService = {
      snapToRoad: vi.fn(async () => ({ lat: 55.95, lon: -3.19 })),
      calculateRoute: vi.fn(),
    } satisfies RouteService;
    const geocoder = { reverseGeocode: vi.fn(), reverseGeocodeStreet: vi.fn(async () => "Royal Mile") } satisfies Geocoder;

    const service = createRoutePlannerService({ prisma: {} as never, routeService, geocoder });
    const result = await service.snapPoint(55.9533, -3.1883, false);

    expect(result).toEqual({ lat: 55.95, lon: -3.19, location: null });
    expect(geocoder.reverseGeocodeStreet).not.toHaveBeenCalled();
  });

  it("falls back to the raw coordinates when snapping fails, rather than blocking the user", async () => {
    const routeService = { snapToRoad: vi.fn(async () => null), calculateRoute: vi.fn() } satisfies RouteService;
    const geocoder = { reverseGeocode: vi.fn(), reverseGeocodeStreet: vi.fn(async () => null) } satisfies Geocoder;

    const service = createRoutePlannerService({ prisma: {} as never, routeService, geocoder });
    const result = await service.snapPoint(55.9533, -3.1883, true);

    expect(result).toEqual({ lat: 55.9533, lon: -3.1883, location: null });
  });
});

describe("createRoutePlannerService.calculateRoute", () => {
  it("passes through to the route service", async () => {
    const routeResult: RouteResult = {
      geometryLatLng: [[55, -3]],
      distanceM: 100,
      ascentM: 1,
      descentM: 2,
      snappedPoints: [{ lat: 55, lon: -3 }],
      elevationProfile: [{ distanceM: 0, elevationM: 42 }],
    };
    const routeService = { snapToRoad: vi.fn(), calculateRoute: vi.fn(async () => routeResult) } satisfies RouteService;
    const geocoder = { reverseGeocode: vi.fn(), reverseGeocodeStreet: vi.fn() } satisfies Geocoder;

    const service = createRoutePlannerService({ prisma: {} as never, routeService, geocoder });
    const result = await service.calculateRoute([{ lat: 1, lon: 1 }, { lat: 2, lon: 2 }]);

    expect(result).toBe(routeResult);
  });

  it("propagates a failure from the route service rather than swallowing it", async () => {
    const routeService = {
      snapToRoad: vi.fn(),
      calculateRoute: vi.fn(async () => {
        throw new Error("route calc failed");
      }),
    } satisfies RouteService;
    const geocoder = { reverseGeocode: vi.fn(), reverseGeocodeStreet: vi.fn() } satisfies Geocoder;

    const service = createRoutePlannerService({ prisma: {} as never, routeService, geocoder });
    await expect(service.calculateRoute([{ lat: 1, lon: 1 }, { lat: 2, lon: 2 }])).rejects.toThrow("route calc failed");
  });
});
