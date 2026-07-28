/**
 * Exercises the actual import-processing pipeline (packages/api/src/modules/import/import.service.ts)
 * directly against a real Postgres, bypassing the BullMQ queue/worker — the auth-and-import.test.ts
 * integration test only covers the upload/enqueue HTTP path, not processing itself.
 *
 * Requires DATABASE_URL pointed at a real Postgres with migrations applied — see
 * auth-and-import.test.ts's header comment for the same caveat.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import type { Geocoder } from "../../src/modules/import/geocode.js";
import { createHealthMetricsService } from "../../src/modules/import/health-metrics.service.js";
import { createImportService } from "../../src/modules/import/import.service.js";
import type { WeatherService } from "../../src/modules/import/weather.js";
import { buildApp } from "../../src/app.js";

const noopGeocoder: Geocoder = { reverseGeocode: async () => null, reverseGeocodeStreet: async () => null };
const noopWeather: WeatherService = { getWeatherId: async () => null };

describe("health metrics import processing", () => {
  let app: FastifyInstance;
  let userId: string;
  let tmpDir: string;
  const email = `health-metrics-${Date.now()}@example.com`;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    const user = await app.prisma.user.create({ data: { email, passwordHash: "not-used-in-this-test" } });
    userId = user.id;
    tmpDir = mkdtempSync(join(tmpdir(), "health-metrics-import-"));
  });

  afterAll(async () => {
    await app.prisma.user.delete({ where: { id: userId } }); // cascades runs/sleep/bodyBattery
    rmSync(tmpDir, { recursive: true, force: true });
    await app.close();
  });

  it("stores one sleep/body_battery row per day, extracted even from a non-running activity, with the later activity's values winning", async () => {
    const day = { y: 2027, m: 2, d: 1 }; // 2027-03-01, month is 0-indexed

    const runningActivity = {
      activity_id: 990001,
      activity_name: "Morning run",
      activity_type_key: "running",
      start_time_gmt: "2027-03-01T06:00:00.0Z",
      start_time_local: "2027-03-01T07:00:00.0Z",
      duration_sec: 1800,
      moving_duration_sec: 1700,
      distance_m: 5000,
      sleep: {
        sleep_time_sec: 25000,
        nap_time_sec: 0,
        deep_sleep_sec: 15000,
        light_sleep_sec: 8000,
        rem_sleep_sec: 1800,
        awake_sleep_sec: 200,
        sleep_start_gmt: Date.UTC(day.y, day.m - 1, day.d, 22, 0, 0),
        sleep_end_gmt: Date.UTC(day.y, day.m, day.d, 6, 0, 0),
        sleep_start_local: Date.UTC(day.y, day.m - 1, day.d, 23, 0, 0),
        sleep_end_local: Date.UTC(day.y, day.m, day.d, 7, 0, 0),
        sleep_score: 70,
        sleep_score_qualifier: "FAIR",
      },
      body_battery: {
        charged: 50,
        drained: 40,
        start_timestamp_gmt: "2027-02-28T00:00:00.0Z",
        end_timestamp_gmt: "2027-03-01T00:00:00.0Z",
        start_timestamp_local: "2027-03-01T00:00:00.0Z",
        end_timestamp_local: "2027-03-02T00:00:00.0Z",
        readings: [{ reading_index: 0, timestamp_gmt: Date.UTC(day.y, day.m, day.d, 8, 0, 0), battery_level: 40 }],
      },
    };

    // Non-running — should be skipped as a Run, but its same-day health metrics should still
    // land in the DB, overwriting the running activity's values since it's processed second.
    const walkingActivity = {
      activity_id: 990002,
      activity_name: "Evening walk",
      activity_type_key: "walking",
      start_time_gmt: "2027-03-01T18:00:00.0Z",
      start_time_local: "2027-03-01T19:00:00.0Z",
      duration_sec: 1200,
      moving_duration_sec: 1100,
      distance_m: 2000,
      sleep: {
        ...runningActivity.sleep,
        sleep_score: 85, // different value — should win, since this activity is processed later
      },
      body_battery: {
        ...runningActivity.body_battery,
        charged: 60,
        readings: [{ reading_index: 0, timestamp_gmt: Date.UTC(day.y, day.m, day.d, 20, 0, 0), battery_level: 55 }],
      },
    };

    const filePath = join(tmpDir, "import.json");
    writeFileSync(
      filePath,
      JSON.stringify({ activity_count: 2, activities: [runningActivity, walkingActivity] }),
    );

    const importJob = await app.prisma.importJob.create({
      data: { userId, fileName: "import.json", status: "PENDING" },
    });

    const importService = createImportService({
      prisma: app.prisma,
      geocoder: noopGeocoder,
      healthMetrics: createHealthMetricsService(app.prisma),
      weather: noopWeather,
    });
    await importService.processImportJob(importJob.id, filePath);

    const completedJob = await app.prisma.importJob.findUniqueOrThrow({ where: { id: importJob.id } });
    expect(completedJob.status).toBe("COMPLETED");
    expect(completedJob.importedCount).toBe(1); // only the running activity becomes a Run
    expect(completedJob.skippedCount).toBe(1);

    const runs = await app.prisma.run.findMany({ where: { userId } });
    expect(runs).toHaveLength(1);
    expect(runs[0]?.activityType).toBe("running");

    const sleepRows = await app.prisma.sleep.findMany({ where: { userId } });
    expect(sleepRows).toHaveLength(1);
    expect(sleepRows[0]?.sleepScore).toBe(85); // walkingActivity's value won (upsert-overwrite)

    const bodyBatteryRows = await app.prisma.bodyBattery.findMany({
      where: { userId },
      include: { readings: true },
    });
    expect(bodyBatteryRows).toHaveLength(1);
    expect(bodyBatteryRows[0]?.charged).toBe(60);
    expect(bodyBatteryRows[0]?.readings).toHaveLength(1); // old reading replaced, not appended
    expect(bodyBatteryRows[0]?.readings[0]?.batteryLevel).toBe(55);
  });
});
