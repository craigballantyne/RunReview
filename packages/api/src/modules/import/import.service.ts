import type { Prisma, PrismaClient } from "@prisma/client";
import type { SkippedActivityDetail } from "@run-review/shared";
import { isRunningActivityType } from "@run-review/shared";
import { recordAuditLog } from "../audit/audit.service.js";
import type { Geocoder } from "./geocode.js";
import type { HealthMetricsService } from "./health-metrics.service.js";
import { peekActivityCount, streamActivities } from "./streaming-parser.js";
import { validateActivity, type ValidatedActivity } from "./validation.js";

const PROGRESS_FLUSH_INTERVAL = 25;

export interface ImportServiceDeps {
  prisma: PrismaClient;
  geocoder: Geocoder;
  healthMetrics: HealthMetricsService;
}

/**
 * Maps one validated activity (source field names) onto Run + nested-table create input
 * (target field names). Kept standalone so a future OAuth-sync job can reuse it against the
 * same provider payload shape, per the import module's extensibility note.
 */
export function mapActivityToRunCreateInput(
  activity: ValidatedActivity,
  userId: string,
  externalActivityId: bigint,
  location: string | null,
) {
  return {
    userId,
    externalActivityId,
    activityName: activity.activity_name,
    activityType: activity.activity_type_key,
    startTimeGmt: new Date(activity.start_time_gmt),
    startTimeLocal: new Date(activity.start_time_local),
    durationSec: activity.duration_sec,
    movingDurationSec: activity.moving_duration_sec,
    distanceM: activity.distance_m,
    avgSpeedMps: activity.avg_speed_mps,
    maxSpeedMps: activity.max_speed_mps,
    avgHr: activity.avg_hr,
    maxHr: activity.max_hr,
    avgCadenceSpm: activity.avg_cadence_spm,
    maxCadenceSpm: activity.max_cadence_spm,
    elevationGainM: activity.elevation_gain_m,
    elevationLossM: activity.elevation_loss_m,
    calories: activity.calories,
    startLatitude: activity.start_latitude,
    startLongitude: activity.start_longitude,
    location,
    splits: {
      createMany: {
        data: activity.splits.map((s) => ({
          splitIndex: s.split_index,
          startTimeGmt: new Date(s.start_time_gmt),
          distanceM: s.distance_m,
          durationSec: s.duration_sec,
          avgSpeedMps: s.avg_speed_mps,
          avgHr: s.avg_hr,
          maxHr: s.max_hr,
          avgCadenceSpm: s.avg_cadence_spm,
          elevationGainM: s.elevation_gain_m,
          elevationLossM: s.elevation_loss_m,
        })),
      },
    },
    hrZones: {
      createMany: {
        data: activity.hr_zones.map((z) => ({
          zoneNumber: z.zone_number,
          zoneLowBpm: z.zone_low_bpm,
          zoneHighBpm: z.zone_high_bpm,
          secondsInZone: z.seconds_in_zone,
        })),
      },
    },
    trackPoints: {
      createMany: {
        data: activity.track_points.map((p) => ({
          pointIndex: p.point_index,
          elapsedSec: p.elapsed_sec,
          latitude: p.latitude,
          longitude: p.longitude,
          elevationM: p.elevation_m,
          heartRate: p.heart_rate,
          speedMps: p.speed_mps,
        })),
      },
    },
  };
}

export function createImportService({ prisma, geocoder, healthMetrics }: ImportServiceDeps) {
  async function insertRun(userId: string, activity: ValidatedActivity, externalActivityId: bigint) {
    let location: string | null = null;
    if (activity.start_latitude != null && activity.start_longitude != null) {
      location = await geocoder.reverseGeocode(activity.start_latitude, activity.start_longitude);
    }
    await prisma.run.create({
      data: mapActivityToRunCreateInput(activity, userId, externalActivityId, location),
    });
  }

  return {
    async processImportJob(jobId: string, filePath: string): Promise<void> {
      const job = await prisma.importJob.findUniqueOrThrow({ where: { id: jobId }, include: { user: true } });

      await prisma.importJob.update({
        where: { id: jobId },
        data: { status: "PROCESSING", startedAt: new Date() },
      });

      const totalActivities = await peekActivityCount(filePath).catch(() => null);
      if (totalActivities !== null) {
        await prisma.importJob.update({ where: { id: jobId }, data: { totalActivities } });
      }

      let processed = 0;
      let imported = 0;
      let skipped = 0;
      let sawAnyActivity = false;
      const skippedDetails: SkippedActivityDetail[] = [];

      const flushProgress = () =>
        prisma.importJob.update({
          where: { id: jobId },
          data: { processedActivities: processed, importedCount: imported, skippedCount: skipped },
        });

      try {
        for await (const raw of streamActivities(filePath)) {
          sawAnyActivity = true;
          processed++;

          const validation = validateActivity(raw);
          if (!validation.valid) {
            skipped++;
            skippedDetails.push({
              externalActivityId: validation.externalActivityId,
              activityName: validation.activityName,
              reason: validation.reason,
            });
          } else {
            const activity = validation.activity;

            // Sleep/body_battery are full-day health metrics, not run-specific — extracted from
            // every activity regardless of running-type filtering or Run dedup below, so a rest
            // day whose only logged activity is a walk doesn't silently lose its health data.
            await healthMetrics.upsertSleep(job.userId, activity.sleep);
            await healthMetrics.upsertBodyBattery(job.userId, activity.body_battery);

            if (!isRunningActivityType(activity.activity_type_key)) {
              skipped++;
              skippedDetails.push({
                externalActivityId: activity.activity_id,
                activityName: activity.activity_name,
                reason: `Not a running activity (type: ${activity.activity_type_key})`,
              });
            } else {
              let externalActivityId: bigint;
              try {
                externalActivityId = BigInt(activity.activity_id);
              } catch {
                skipped++;
                skippedDetails.push({
                  externalActivityId: activity.activity_id,
                  activityName: activity.activity_name,
                  reason: "Invalid activity_id",
                });
                continue;
              }

              const exists = await prisma.run.findUnique({
                where: { userId_externalActivityId: { userId: job.userId, externalActivityId } },
                select: { id: true },
              });

              if (exists) {
                skipped++;
                skippedDetails.push({
                  externalActivityId: activity.activity_id,
                  activityName: activity.activity_name,
                  reason: "Duplicate — already imported",
                });
              } else {
                await insertRun(job.userId, activity, externalActivityId);
                imported++;
              }
            }
          }

          if (processed % PROGRESS_FLUSH_INTERVAL === 0) {
            await flushProgress();
          }
        }
      } catch (err) {
        await flushProgress().catch(() => undefined);
        await prisma.importJob.update({
          where: { id: jobId },
          data: {
            status: "FAILED",
            errorMessage: `The file could not be read as valid JSON: ${err instanceof Error ? err.message : "unknown error"}`,
            completedAt: new Date(),
          },
        });
        return;
      }

      await flushProgress();

      if (!sawAnyActivity) {
        await prisma.importJob.update({
          where: { id: jobId },
          data: {
            status: "FAILED",
            errorMessage: "No activities found in the uploaded file — check it matches the expected export format",
            completedAt: new Date(),
          },
        });
        return;
      }

      await prisma.$transaction(async (tx) => {
        await tx.importJob.update({
          where: { id: jobId },
          data: {
            status: "COMPLETED",
            skippedDetails: skippedDetails as unknown as Prisma.InputJsonValue,
            completedAt: new Date(),
          },
        });
        await recordAuditLog(tx, {
          userId: job.userId,
          userEmail: job.user.email,
          action: "RUN_DATA_IMPORTED",
          metadata: { importedCount: imported, skippedCount: skipped },
        });
      });
    },
  };
}

export type ImportService = ReturnType<typeof createImportService>;
