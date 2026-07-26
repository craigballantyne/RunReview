import type { PrismaClient } from "@prisma/client";
import type { ValidatedActivity } from "./validation.js";

type Sleep = NonNullable<ValidatedActivity["sleep"]>;
type BodyBattery = NonNullable<ValidatedActivity["body_battery"]>;

const HAS_TZ_SUFFIX = /(Z|[+-]\d{2}:?\d{2})$/;

/**
 * Sleep's timestamps are epoch-ms numbers (always an unambiguous instant). Body_battery's are
 * ISO strings with no timezone suffix (e.g. "2026-07-21T00:00:00.0") — JS's Date constructor
 * parses date-time strings like that as the *server process's* local timezone, not UTC, so the
 * result would silently differ depending on where this code runs. Appending "Z" forces a
 * deterministic UTC interpretation regardless of server timezone.
 */
function toDate(value: number | string): Date {
  if (typeof value === "number") return new Date(value);
  return new Date(HAS_TZ_SUFFIX.test(value) ? value : `${value}Z`);
}

/**
 * Both sleep and body_battery "local" fields are stored the same way as the activity's own
 * start_time_local: parsed into a Date, then only the UTC digits are kept (into a
 * timezone-naive column) — those UTC digits ARE the intended local wall-clock time in this
 * export format, not a real UTC instant. Deriving a calendar day means taking the same UTC
 * digits and truncating to midnight.
 */
export function localDateOnly(value: number | string): Date {
  const d = toDate(value);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export interface HealthMetricsService {
  upsertSleep(userId: string, sleep: Sleep | null): Promise<void>;
  upsertBodyBattery(userId: string, bodyBattery: BodyBattery | null): Promise<void>;
}

export function createHealthMetricsService(prisma: PrismaClient): HealthMetricsService {
  return {
    async upsertSleep(userId, sleep) {
      if (!sleep) return;
      try {
        const day = localDateOnly(sleep.sleep_end_local); // attributed to the wake-up day
        await prisma.sleep.upsert({
          where: { userId_day: { userId, day } },
          create: {
            userId,
            day,
            sleepTimeSec: sleep.sleep_time_sec,
            napTimeSec: sleep.nap_time_sec,
            deepSleepSec: sleep.deep_sleep_sec,
            lightSleepSec: sleep.light_sleep_sec,
            remSleepSec: sleep.rem_sleep_sec,
            awakeSleepSec: sleep.awake_sleep_sec,
            sleepStartGmt: toDate(sleep.sleep_start_gmt),
            sleepEndGmt: toDate(sleep.sleep_end_gmt),
            sleepStartLocal: toDate(sleep.sleep_start_local),
            sleepEndLocal: toDate(sleep.sleep_end_local),
            sleepScore: sleep.sleep_score,
            sleepScoreQualifier: sleep.sleep_score_qualifier,
          },
          update: {
            sleepTimeSec: sleep.sleep_time_sec,
            napTimeSec: sleep.nap_time_sec,
            deepSleepSec: sleep.deep_sleep_sec,
            lightSleepSec: sleep.light_sleep_sec,
            remSleepSec: sleep.rem_sleep_sec,
            awakeSleepSec: sleep.awake_sleep_sec,
            sleepStartGmt: toDate(sleep.sleep_start_gmt),
            sleepEndGmt: toDate(sleep.sleep_end_gmt),
            sleepStartLocal: toDate(sleep.sleep_start_local),
            sleepEndLocal: toDate(sleep.sleep_end_local),
            sleepScore: sleep.sleep_score,
            sleepScoreQualifier: sleep.sleep_score_qualifier,
          },
        });
      } catch {
        // Best-effort, matches the geocoder's philosophy: a bad health-metrics block on one
        // activity should never fail that activity's import, let alone the whole file.
      }
    },

    async upsertBodyBattery(userId, bodyBattery) {
      if (!bodyBattery) return;
      try {
        // The window is already a full local calendar day (start_timestamp_local sits at local
        // midnight in practice), so there's no start/end ambiguity like sleep has.
        const day = localDateOnly(bodyBattery.start_timestamp_local);
        await prisma.$transaction(async (tx) => {
          const record = await tx.bodyBattery.upsert({
            where: { userId_day: { userId, day } },
            create: {
              userId,
              day,
              charged: bodyBattery.charged,
              drained: bodyBattery.drained,
              startTimestampGmt: toDate(bodyBattery.start_timestamp_gmt),
              endTimestampGmt: toDate(bodyBattery.end_timestamp_gmt),
              startTimestampLocal: toDate(bodyBattery.start_timestamp_local),
              endTimestampLocal: toDate(bodyBattery.end_timestamp_local),
            },
            update: {
              charged: bodyBattery.charged,
              drained: bodyBattery.drained,
              startTimestampGmt: toDate(bodyBattery.start_timestamp_gmt),
              endTimestampGmt: toDate(bodyBattery.end_timestamp_gmt),
              startTimestampLocal: toDate(bodyBattery.start_timestamp_local),
              endTimestampLocal: toDate(bodyBattery.end_timestamp_local),
            },
          });

          // Nested writes can't conditionally replace children between the create/update
          // branches of a single upsert, so readings are fully replaced explicitly.
          await tx.bodyBatteryReading.deleteMany({ where: { bodyBatteryId: record.id } });
          if (bodyBattery.readings.length > 0) {
            await tx.bodyBatteryReading.createMany({
              data: bodyBattery.readings.map((r) => ({
                bodyBatteryId: record.id,
                readingIndex: r.reading_index,
                timestampGmt: toDate(r.timestamp_gmt),
                batteryLevel: r.battery_level,
              })),
            });
          }
        });
      } catch {
        // Best-effort, same rationale as upsertSleep above.
      }
    },
  };
}
