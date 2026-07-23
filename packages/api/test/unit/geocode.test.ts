import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGeocoder } from "../../src/modules/import/geocode.js";
import type { Env } from "../../src/config/env.js";

function createFakePrisma() {
  const cache = new Map<string, { latRounded: number; lonRounded: number; location: string }>();
  const key = (lat: number, lon: number) => `${lat}:${lon}`;

  return {
    cache,
    geocodeCache: {
      findUnique: vi.fn(async ({ where }: { where: { latRounded_lonRounded: { latRounded: number; lonRounded: number } } }) => {
        const { latRounded, lonRounded } = where.latRounded_lonRounded;
        return cache.get(key(latRounded, lonRounded)) ?? null;
      }),
      upsert: vi.fn(async ({ create }: { create: { latRounded: number; lonRounded: number; location: string } }) => {
        cache.set(key(create.latRounded, create.lonRounded), create);
        return create;
      }),
    },
  };
}

const fakeEnv = { NOMINATIM_USER_AGENT: "RunReview/test" } as Env;

describe("createGeocoder", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ address: { city: "Edinburgh", country: "United Kingdom" }, display_name: "Edinburgh, UK" }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls Nominatim and returns a formatted locality on first lookup", async () => {
    const prisma = createFakePrisma();
    const geocoder = createGeocoder(prisma as never, fakeEnv);

    const location = await geocoder.reverseGeocode(55.9533, -3.1883);

    expect(location).toBe("Edinburgh, United Kingdom");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("serves the second lookup for nearby coordinates from the cache without hitting the network", async () => {
    const prisma = createFakePrisma();
    const geocoder = createGeocoder(prisma as never, fakeEnv);

    await geocoder.reverseGeocode(55.9533, -3.1883);
    await geocoder.reverseGeocode(55.95331, -3.18831); // within ~110m rounding precision

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns null (never throws) when Nominatim errors, so geocoding failure never fails the import", async () => {
    fetchMock.mockImplementation(async () => new Response("", { status: 500 }));
    const prisma = createFakePrisma();
    const geocoder = createGeocoder(prisma as never, fakeEnv);

    const location = await geocoder.reverseGeocode(1, 1);
    expect(location).toBeNull();
  });

  it("returns null and does not throw when the network request itself fails", async () => {
    fetchMock.mockImplementation(async () => {
      throw new Error("network down");
    });
    const prisma = createFakePrisma();
    const geocoder = createGeocoder(prisma as never, fakeEnv);

    const location = await geocoder.reverseGeocode(2, 2);
    expect(location).toBeNull();
  });
});
