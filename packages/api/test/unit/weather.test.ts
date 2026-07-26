import { afterEach, describe, expect, it, vi } from "vitest";
import { createWeatherService, selectBaseUrl } from "../../src/modules/import/weather.js";

interface FakeRow {
  id: number;
  latRounded: number;
  lonRounded: number;
  timestampUtc: Date;
  [key: string]: unknown;
}

function createFakePrisma() {
  const store: FakeRow[] = [];
  let nextId = 1;

  return {
    store,
    weatherHourly: {
      findMany: vi.fn(
        async ({
          where,
        }: {
          where: { latRounded: number; lonRounded: number; timestampUtc: { gte: Date; lt: Date } };
        }) =>
          store.filter(
            (row) =>
              row.latRounded === where.latRounded &&
              row.lonRounded === where.lonRounded &&
              row.timestampUtc >= where.timestampUtc.gte &&
              row.timestampUtc < where.timestampUtc.lt,
          ),
      ),
      createMany: vi.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => {
        for (const row of data) {
          store.push({ id: nextId++, ...row } as FakeRow);
        }
        return { count: data.length };
      }),
    },
  };
}

function seedRow(prisma: ReturnType<typeof createFakePrisma>, timestampUtc: Date, overrides: Partial<FakeRow> = {}) {
  prisma.store.push({
    id: prisma.store.length + 1,
    latRounded: 55.95,
    lonRounded: -3.19,
    timestampUtc,
    temperatureC: 12,
    ...overrides,
  });
}

function canOpenMeteoResponse(times: string[]) {
  return {
    hourly: {
      time: times,
      temperature_2m: times.map(() => 10),
      apparent_temperature: times.map(() => 9),
      relative_humidity_2m: times.map(() => 80),
      precipitation: times.map(() => 0),
      weather_code: times.map(() => 1),
      cloud_cover: times.map(() => 50),
      wind_speed_10m: times.map(() => 3),
      wind_direction_10m: times.map(() => 180),
      wind_gusts_10m: times.map(() => 5),
    },
  };
}

describe("selectBaseUrl", () => {
  const now = new Date("2026-07-26T00:00:00Z");

  it("uses the forecast API for a recent date (within the archive lag buffer)", () => {
    const threeDaysAgo = new Date("2026-07-23T00:00:00Z");
    expect(selectBaseUrl(threeDaysAgo, now)).toBe("https://api.open-meteo.com/v1/forecast");
  });

  it("uses the historical archive API for an older date", () => {
    const thirtyDaysAgo = new Date("2026-06-26T00:00:00Z");
    expect(selectBaseUrl(thirtyDaysAgo, now)).toBe("https://archive-api.open-meteo.com/v1/archive");
  });
});

describe("createWeatherService", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("serves a lookup from cached rows without hitting the network", async () => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const prisma = createFakePrisma();
    seedRow(prisma, new Date("2026-07-20T06:00:00Z"));
    const weather = createWeatherService(prisma as never);

    const id = await weather.getWeatherId(55.9533, -3.1883, new Date("2026-07-20T06:10:00Z"));

    expect(id).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches and caches a full day on a cache miss, then returns the nearest hour", async () => {
    fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify(canOpenMeteoResponse(["2026-07-20T00:00", "2026-07-20T01:00", "2026-07-20T02:00"])),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const prisma = createFakePrisma();
    const weather = createWeatherService(prisma as never);

    const id = await weather.getWeatherId(55.9533, -3.1883, new Date("2026-07-20T00:41:00Z"));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(prisma.store).toHaveLength(3);
    // 00:41 is closer to 01:00 than 00:00
    expect(prisma.store.find((r) => r.id === id)?.timestampUtc.toISOString()).toBe("2026-07-20T01:00:00.000Z");
  });

  it("returns null (never throws) when Open-Meteo errors, so a weather lookup failure never fails the run", async () => {
    fetchMock = vi.fn(async () => new Response("", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    const prisma = createFakePrisma();
    const weather = createWeatherService(prisma as never);

    const id = await weather.getWeatherId(1, 1, new Date("2026-07-20T00:00:00Z"));
    expect(id).toBeNull();
  });

  it("returns null and does not throw when the network request itself fails", async () => {
    fetchMock = vi.fn(async () => {
      throw new Error("network down");
    });
    vi.stubGlobal("fetch", fetchMock);

    const prisma = createFakePrisma();
    const weather = createWeatherService(prisma as never);

    const id = await weather.getWeatherId(2, 2, new Date("2026-07-20T00:00:00Z"));
    expect(id).toBeNull();
  });

  it("returns null when Open-Meteo responds with an empty/malformed hourly payload", async () => {
    fetchMock = vi.fn(async () => new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const prisma = createFakePrisma();
    const weather = createWeatherService(prisma as never);

    const id = await weather.getWeatherId(3, 3, new Date("2026-07-20T00:00:00Z"));
    expect(id).toBeNull();
  });
});
