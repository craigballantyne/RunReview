import { afterEach, describe, expect, it, vi } from "vitest";
import { createRouteService, RouteCalculationError } from "../../src/modules/route-planner/openroute.js";
import type { Env } from "../../src/config/env.js";

const fakeEnv = { OPENROUTESERVICE_API_KEY: "test-key" } as Env;
const EARTH_RADIUS_M = 6371000; // matches the module's own haversine constant, for exact test distances

function metersToLatDegrees(distanceM: number): number {
  return (distanceM / EARTH_RADIUS_M) * (180 / Math.PI);
}

function snapResponseBody(location: [number, number] | null) {
  return { locations: location ? [{ location }] : [null] };
}

function directionsResponseBody(coordinates: [number, number, number?][], summary: { distance: number; ascent: number; descent: number }) {
  return {
    features: [
      {
        geometry: { coordinates },
        // ascent/descent are top-level properties on `properties`, not nested under `summary` —
        // confirmed against a live OpenRouteService response.
        properties: { summary: { distance: summary.distance }, ascent: summary.ascent, descent: summary.descent },
      },
    ],
  };
}

describe("createRouteService.snapToRoad", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the snapped lat/lon parsed from the response", async () => {
    fetchMock = vi.fn(async () => new Response(JSON.stringify(snapResponseBody([-3.19, 55.95])), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const service = createRouteService(fakeEnv);
    const result = await service.snapToRoad({ lat: 55.9533, lon: -3.1883 });

    expect(result).toEqual({ lat: 55.95, lon: -3.19 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/v2/snap/foot-walking/json");
  });

  it("returns null when the response is not ok", async () => {
    fetchMock = vi.fn(async () => new Response("", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createRouteService(fakeEnv).snapToRoad({ lat: 1, lon: 1 });
    expect(result).toBeNull();
  });

  it("returns null when no location is found within the snap radius", async () => {
    fetchMock = vi.fn(async () => new Response(JSON.stringify(snapResponseBody(null)), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createRouteService(fakeEnv).snapToRoad({ lat: 1, lon: 1 });
    expect(result).toBeNull();
  });

  it("returns null (never throws) when the network request itself fails", async () => {
    fetchMock = vi.fn(async () => {
      throw new Error("network down");
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await createRouteService(fakeEnv).snapToRoad({ lat: 1, lon: 1 });
    expect(result).toBeNull();
  });
});

describe("createRouteService.calculateRoute", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses geometry (lon,lat -> lat,lon), distance, ascent/descent, elevation profile, and snaps each input point to the nearest point on the route", async () => {
    // A route running along a fixed longitude, latitude increasing from 55.0 to 55.02
    const coordinates: [number, number, number?][] = [
      [-3.2, 55.0, 100],
      [-3.2, 55.01, 150],
      [-3.2, 55.02, 120],
    ];
    fetchMock = vi.fn(
      async () => new Response(JSON.stringify(directionsResponseBody(coordinates, { distance: 2000, ascent: 50, descent: 10 })), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const service = createRouteService(fakeEnv);
    const result = await service.calculateRoute([
      { lat: 55.001, lon: -3.2 }, // closest to [-3.2, 55.0]
      { lat: 55.019, lon: -3.2 }, // closest to [-3.2, 55.02]
    ]);

    expect(result.geometryLatLng).toEqual([
      [55.0, -3.2],
      [55.01, -3.2],
      [55.02, -3.2],
    ]);
    expect(result.distanceM).toBe(2000);
    expect(result.ascentM).toBe(50);
    expect(result.descentM).toBe(10);
    expect(result.snappedPoints).toEqual([
      { lat: 55.0, lon: -3.2 },
      { lat: 55.02, lon: -3.2 },
    ]);
    expect(result.elevationProfile).toHaveLength(3);
    expect(result.elevationProfile.map((p) => p.elevationM)).toEqual([100, 150, 120]);
    expect(result.elevationProfile[0]!.distanceM).toBe(0);

    const [url] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/v2/directions/foot-walking/geojson");
  });

  it("accumulates elevation-profile distance along the route rather than resetting per segment", async () => {
    const stepM = 500;
    const coordinates: [number, number, number?][] = [
      [-3.2, 55.0, 10],
      [-3.2, 55.0 + metersToLatDegrees(stepM), 20],
      [-3.2, 55.0 + metersToLatDegrees(stepM * 2), 30],
    ];
    fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify(directionsResponseBody(coordinates, { distance: 1000, ascent: 20, descent: 0 })), {
          status: 200,
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await createRouteService(fakeEnv).calculateRoute([
      { lat: 55.0, lon: -3.2 },
      { lat: 55.0 + metersToLatDegrees(stepM * 2), lon: -3.2 },
    ]);

    expect(result.elevationProfile[0]!.distanceM).toBeCloseTo(0, 1);
    expect(result.elevationProfile[1]!.distanceM).toBeCloseTo(stepM, 1);
    expect(result.elevationProfile[2]!.distanceM).toBeCloseTo(stepM * 2, 1); // accumulated, not reset
  });

  it("throws RouteCalculationError when the response is not ok", async () => {
    fetchMock = vi.fn(async () => new Response("", { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(createRouteService(fakeEnv).calculateRoute([{ lat: 1, lon: 1 }, { lat: 2, lon: 2 }])).rejects.toThrow(
      RouteCalculationError,
    );
  });

  it("throws RouteCalculationError when the response has no usable route", async () => {
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ features: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(createRouteService(fakeEnv).calculateRoute([{ lat: 1, lon: 1 }, { lat: 2, lon: 2 }])).rejects.toThrow(
      RouteCalculationError,
    );
  });
});
