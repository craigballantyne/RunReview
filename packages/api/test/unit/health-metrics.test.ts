import { describe, expect, it, vi } from "vitest";
import { createHealthMetricsService, localDateOnly } from "../../src/modules/import/health-metrics.service.js";

function createFakePrisma() {
  const sleepUpsert = vi.fn(async ({ create }: { create: unknown }) => create);
  const bodyBatteryUpsert = vi.fn(async ({ create }: { create: { userId: string; day: Date } }) => ({
    id: "bb-1",
    ...create,
  }));
  const readingDeleteMany = vi.fn(async () => ({ count: 0 }));
  const readingCreateMany = vi.fn(async ({ data }: { data: unknown[] }) => ({ count: data.length }));

  const prisma = {
    sleep: { upsert: sleepUpsert },
    bodyBattery: { upsert: bodyBatteryUpsert },
    bodyBatteryReading: { deleteMany: readingDeleteMany, createMany: readingCreateMany },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
  };

  return { prisma, sleepUpsert, bodyBatteryUpsert, readingDeleteMany, readingCreateMany };
}

describe("localDateOnly", () => {
  it("derives the calendar day from an epoch-ms number (sleep's representation)", () => {
    // 1784643120000ms = 2026-07-21T14:12:00Z, per the sample sleep_end_local value
    expect(localDateOnly(1784643120000).toISOString()).toBe("2026-07-21T00:00:00.000Z");
  });

  it("derives the calendar day from an ISO string (body_battery's representation)", () => {
    expect(localDateOnly("2026-07-21T00:00:00.0").toISOString()).toBe("2026-07-21T00:00:00.000Z");
  });

  it("truncates a late-night timestamp down to its own day, not the next one", () => {
    expect(localDateOnly("2026-07-21T23:59:59.0").toISOString()).toBe("2026-07-21T00:00:00.000Z");
  });
});

describe("createHealthMetricsService.upsertSleep", () => {
  it("is a no-op when sleep is null", async () => {
    const { prisma, sleepUpsert } = createFakePrisma();
    await createHealthMetricsService(prisma as never).upsertSleep("user-1", null);
    expect(sleepUpsert).not.toHaveBeenCalled();
  });

  it("attributes the row to the wake-up day (sleep_end_local), not sleep_start_local", async () => {
    const { prisma, sleepUpsert } = createFakePrisma();
    await createHealthMetricsService(prisma as never).upsertSleep("user-1", {
      sleep_time_sec: 27840,
      nap_time_sec: 0,
      deep_sleep_sec: 3840,
      light_sleep_sec: 18360,
      rem_sleep_sec: 5640,
      awake_sleep_sec: 420,
      sleep_start_gmt: 1784611260000,
      sleep_end_gmt: 1784639520000,
      sleep_start_local: 1784614860000, // 2026-07-21T06:21:00Z
      sleep_end_local: 1784643120000, // 2026-07-21T14:12:00Z
      sleep_score: 89,
      sleep_score_qualifier: "GOOD",
    });

    expect(sleepUpsert).toHaveBeenCalledTimes(1);
    const call = sleepUpsert.mock.calls[0]![0];
    expect(call.where.userId_day).toEqual({ userId: "user-1", day: localDateOnly(1784643120000) });
    expect(call.create.sleepScore).toBe(89);
  });

  it("swallows errors so a bad sleep block never throws", async () => {
    const { prisma, sleepUpsert } = createFakePrisma();
    sleepUpsert.mockRejectedValueOnce(new Error("db down"));
    await expect(
      createHealthMetricsService(prisma as never).upsertSleep("user-1", {
        sleep_time_sec: 100,
        nap_time_sec: null,
        deep_sleep_sec: null,
        light_sleep_sec: null,
        rem_sleep_sec: null,
        awake_sleep_sec: null,
        sleep_start_gmt: 0,
        sleep_end_gmt: 0,
        sleep_start_local: 0,
        sleep_end_local: 0,
        sleep_score: null,
        sleep_score_qualifier: null,
      }),
    ).resolves.toBeUndefined();
  });
});

describe("createHealthMetricsService.upsertBodyBattery", () => {
  it("is a no-op when body_battery is null", async () => {
    const { prisma, bodyBatteryUpsert } = createFakePrisma();
    await createHealthMetricsService(prisma as never).upsertBodyBattery("user-1", null);
    expect(bodyBatteryUpsert).not.toHaveBeenCalled();
  });

  it("replaces readings via delete-then-createMany scoped to the upserted row's id", async () => {
    const { prisma, bodyBatteryUpsert, readingDeleteMany, readingCreateMany } = createFakePrisma();
    await createHealthMetricsService(prisma as never).upsertBodyBattery("user-1", {
      charged: 67,
      drained: 67,
      start_timestamp_gmt: "2026-07-20T23:00:00.0",
      end_timestamp_gmt: "2026-07-21T23:00:00.0",
      start_timestamp_local: "2026-07-21T00:00:00.0",
      end_timestamp_local: "2026-07-22T00:00:00.0",
      readings: [
        { reading_index: 0, timestamp_gmt: 1784610900000, battery_level: 33 },
        { reading_index: 1, timestamp_gmt: 1784616840000, battery_level: 48 },
      ],
    });

    expect(bodyBatteryUpsert).toHaveBeenCalledTimes(1);
    const upsertCall = bodyBatteryUpsert.mock.calls[0]![0];
    expect(upsertCall.where.userId_day).toEqual({ userId: "user-1", day: localDateOnly("2026-07-21T00:00:00.0") });

    expect(readingDeleteMany).toHaveBeenCalledWith({ where: { bodyBatteryId: "bb-1" } });
    expect(readingCreateMany).toHaveBeenCalledTimes(1);
    const createManyCall = readingCreateMany.mock.calls[0]![0];
    expect(createManyCall.data).toHaveLength(2);
    expect(createManyCall.data[0]).toMatchObject({ bodyBatteryId: "bb-1", readingIndex: 0, batteryLevel: 33 });
  });

  it("swallows errors so a bad body_battery block never throws", async () => {
    const { prisma, bodyBatteryUpsert } = createFakePrisma();
    bodyBatteryUpsert.mockRejectedValueOnce(new Error("db down"));
    await expect(
      createHealthMetricsService(prisma as never).upsertBodyBattery("user-1", {
        charged: null,
        drained: null,
        start_timestamp_gmt: "2026-07-20T23:00:00.0",
        end_timestamp_gmt: "2026-07-21T23:00:00.0",
        start_timestamp_local: "2026-07-21T00:00:00.0",
        end_timestamp_local: "2026-07-22T00:00:00.0",
        readings: [],
      }),
    ).resolves.toBeUndefined();
  });
});
