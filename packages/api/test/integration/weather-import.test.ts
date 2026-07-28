/**
 * Exercises the actual import-processing pipeline directly against a real Postgres, mirroring
 * health-metrics-import.test.ts's pattern — bypasses the BullMQ queue/worker, and stubs global
 * fetch so no real network call reaches Open-Meteo even though createWeatherService is real.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import type { Geocoder } from "../../src/modules/import/geocode.js";
import { createHealthMetricsService } from "../../src/modules/import/health-metrics.service.js";
import { createImportService } from "../../src/modules/import/import.service.js";
import { createWeatherService } from "../../src/modules/import/weather.js";
import { buildApp } from "../../src/app.js";

const noopGeocoder: Geocoder = { reverseGeocode: async () => null, reverseGeocodeStreet: async () => null };

function openMeteoResponse() {
  const times = ["2027-04-01T07:00", "2027-04-01T08:00", "2027-04-01T14:00"];
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

async function createActivityFile(
  tmpDir: string,
  name: string,
  activity: Record<string, unknown>,
): Promise<string> {
  const filePath = join(tmpDir, name);
  writeFileSync(filePath, JSON.stringify({ activity_count: 1, activities: [activity] }));
  return filePath;
}

describe("weather import processing", () => {
  let app: FastifyInstance;
  let userAId: string;
  let userBId: string;
  let tmpDir: string;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    const userA = await app.prisma.user.create({
      data: { email: `weather-a-${Date.now()}@example.com`, passwordHash: "not-used-in-this-test" },
    });
    const userB = await app.prisma.user.create({
      data: { email: `weather-b-${Date.now()}@example.com`, passwordHash: "not-used-in-this-test" },
    });
    userAId = userA.id;
    userBId = userB.id;
    tmpDir = mkdtempSync(join(tmpdir(), "weather-import-"));
  });

  afterAll(async () => {
    await app.prisma.user.delete({ where: { id: userAId } });
    await app.prisma.user.delete({ where: { id: userBId } });
    // weather_hourly is a shared, non-user-owned cache table (onDelete: SetNull on Run), so it
    // isn't cleaned up by the user cascade above — remove what this test fetched so a repeat run
    // doesn't find it pre-cached and break the "shares one fetch" assertion.
    await app.prisma.weatherHourly.deleteMany({ where: { latRounded: 51.51, lonRounded: -0.13 } });
    rmSync(tmpDir, { recursive: true, force: true });
    await app.close();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shares one Open-Meteo fetch across two runs at the same rounded location/day, even across different users", async () => {
    fetchMock = vi.fn(async () => new Response(JSON.stringify(openMeteoResponse()), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const importService = createImportService({
      prisma: app.prisma,
      geocoder: noopGeocoder,
      healthMetrics: createHealthMetricsService(app.prisma),
      weather: createWeatherService(app.prisma),
    });

    // Different exact coordinates, but within 2-decimal rounding of each other — should share
    // the same weather_hourly cache entries.
    const activityA = {
      activity_id: 880001,
      activity_name: "Morning run",
      activity_type_key: "running",
      start_time_gmt: "2027-04-01T08:05:00.0Z",
      start_time_local: "2027-04-01T09:05:00.0Z",
      duration_sec: 1800,
      moving_duration_sec: 1700,
      distance_m: 5000,
      start_latitude: 51.5074,
      start_longitude: -0.1278,
    };
    const activityB = {
      activity_id: 880002,
      activity_name: "Afternoon run",
      activity_type_key: "running",
      start_time_gmt: "2027-04-01T13:50:00.0Z",
      start_time_local: "2027-04-01T14:50:00.0Z",
      duration_sec: 1800,
      moving_duration_sec: 1700,
      distance_m: 5000,
      start_latitude: 51.5079,
      start_longitude: -0.1275,
    };

    const filePathA = await createActivityFile(tmpDir, "a.json", activityA);
    const jobA = await app.prisma.importJob.create({ data: { userId: userAId, fileName: "a.json", status: "PENDING" } });
    await importService.processImportJob(jobA.id, filePathA);

    const filePathB = await createActivityFile(tmpDir, "b.json", activityB);
    const jobB = await app.prisma.importJob.create({ data: { userId: userBId, fileName: "b.json", status: "PENDING" } });
    await importService.processImportJob(jobB.id, filePathB);

    expect(fetchMock).toHaveBeenCalledTimes(1); // second run's day+location was already cached

    const runA = await app.prisma.run.findFirstOrThrow({ where: { userId: userAId } });
    const runB = await app.prisma.run.findFirstOrThrow({ where: { userId: userBId } });
    expect(runA.weatherId).not.toBeNull();
    expect(runB.weatherId).not.toBeNull();

    const weatherA = await app.prisma.weatherHourly.findUniqueOrThrow({ where: { id: runA.weatherId! } });
    const weatherB = await app.prisma.weatherHourly.findUniqueOrThrow({ where: { id: runB.weatherId! } });
    expect(weatherA.latRounded).toBe(weatherB.latRounded);
    expect(weatherA.lonRounded).toBe(weatherB.lonRounded);
    // 08:05 nearest to 08:00, 13:50 nearest to 14:00 — different hours, same day/location
    expect(weatherA.timestampUtc.toISOString()).toBe("2027-04-01T08:00:00.000Z");
    expect(weatherB.timestampUtc.toISOString()).toBe("2027-04-01T14:00:00.000Z");
  });

  it("leaves weatherId null and never calls Open-Meteo for a run with no start coordinates", async () => {
    fetchMock = vi.fn(async () => new Response(JSON.stringify(openMeteoResponse()), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const importService = createImportService({
      prisma: app.prisma,
      geocoder: noopGeocoder,
      healthMetrics: createHealthMetricsService(app.prisma),
      weather: createWeatherService(app.prisma),
    });

    const activity = {
      activity_id: 880003,
      activity_name: "Treadmill run",
      activity_type_key: "running",
      start_time_gmt: "2027-04-02T08:00:00.0Z",
      start_time_local: "2027-04-02T09:00:00.0Z",
      duration_sec: 1800,
      moving_duration_sec: 1700,
      distance_m: 5000,
      // start_latitude / start_longitude intentionally omitted
    };

    const filePath = await createActivityFile(tmpDir, "c.json", activity);
    const job = await app.prisma.importJob.create({ data: { userId: userAId, fileName: "c.json", status: "PENDING" } });
    await importService.processImportJob(job.id, filePath);

    const run = await app.prisma.run.findFirstOrThrow({ where: { userId: userAId, externalActivityId: 880003n } });
    expect(run.weatherId).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
