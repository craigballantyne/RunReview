import type { PrismaClient } from "@prisma/client";
import {
  standardDistanceLabel,
  type RunBestEffort,
  type RunDetail,
  type RunInsight,
  type RunListItem,
  type RunListPage,
  type SegmentClassification,
} from "@run-review/shared";
import { NotFoundError, ValidationError } from "../../lib/errors.js";
import { recordAuditLog } from "../audit/audit.service.js";

interface Cursor {
  startTimeGmt: string;
  id: string;
}

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

export function decodeCursor(raw: string): Cursor {
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (typeof parsed.startTimeGmt !== "string" || typeof parsed.id !== "string") {
      throw new Error("malformed");
    }
    return parsed;
  } catch {
    throw new ValidationError("Invalid pagination cursor");
  }
}

export interface RunsServiceDeps {
  prisma: PrismaClient;
}

export function createRunsService({ prisma }: RunsServiceDeps) {
  return {
    async listRuns(userId: string, limit: number, cursorRaw?: string): Promise<RunListPage> {
      const cursor = cursorRaw ? decodeCursor(cursorRaw) : null;

      const rows = await prisma.run.findMany({
        where: {
          userId,
          ...(cursor
            ? {
                OR: [
                  { startTimeGmt: { lt: new Date(cursor.startTimeGmt) } },
                  { startTimeGmt: new Date(cursor.startTimeGmt), id: { lt: cursor.id } },
                ],
              }
            : {}),
        },
        orderBy: [{ startTimeGmt: "desc" }, { id: "desc" }],
        take: limit + 1,
        select: {
          id: true,
          activityName: true,
          activityType: true,
          startTimeLocal: true,
          startTimeGmt: true,
          location: true,
          distanceM: true,
          movingDurationSec: true,
        },
      });

      const hasMore = rows.length > limit;
      const pageRows = hasMore ? rows.slice(0, limit) : rows;
      const lastRow = pageRows[pageRows.length - 1];

      const items: RunListItem[] = pageRows.map((run) => ({
        id: run.id,
        activityName: run.activityName,
        activityType: run.activityType,
        startTimeLocal: run.startTimeLocal.toISOString(),
        location: run.location,
        distanceM: run.distanceM,
        movingDurationSec: run.movingDurationSec,
      }));

      return {
        items,
        nextCursor:
          hasMore && lastRow ? encodeCursor({ startTimeGmt: lastRow.startTimeGmt.toISOString(), id: lastRow.id }) : null,
      };
    },

    async getRunDetail(userId: string, runId: string): Promise<RunDetail> {
      const run = await prisma.run.findFirst({
        where: { id: runId, userId },
        include: {
          splits: { orderBy: { splitIndex: "asc" } },
          hrZones: { orderBy: { zoneNumber: "asc" } },
          trackPoints: { orderBy: { pointIndex: "asc" } },
          weather: true,
          insight: true,
          bestEfforts: { orderBy: { distanceM: "asc" } },
        },
      });

      if (!run) {
        throw new NotFoundError("Run not found");
      }

      // The athlete's fastest at each distance across their whole history. `isPr` on the stored row
      // is point-in-time — it says the effort beat everything *before* it, which stays true even
      // after a later run takes the record. A trophy should mean "still your fastest", so that has
      // to be decided here rather than read off the row.
      const currentBests = new Map<number, number>();
      if (run.bestEfforts.length > 0) {
        const grouped = await prisma.runBestEffort.groupBy({
          by: ["distanceM"],
          where: { userId, distanceM: { in: run.bestEfforts.map((e) => e.distanceM) } },
          _min: { durationSec: true },
        });
        for (const row of grouped) {
          if (row._min.durationSec !== null) currentBests.set(row.distanceM, row._min.durationSec);
        }
      }

      const insight: RunInsight | null = run.insight
        ? {
            workoutStructure: run.insight.workoutStructure as RunInsight["workoutStructure"],
            lapMode: run.insight.lapMode as RunInsight["lapMode"],
            segments: (run.insight.segmentRoles ?? []) as unknown as SegmentClassification[],
          }
        : null;

      const bestEfforts: RunBestEffort[] = run.bestEfforts.map((e) => ({
        distanceM: e.distanceM,
        label: standardDistanceLabel(e.distanceM),
        durationSec: e.durationSec,
        startOffsetM: e.startOffsetM,
        isPr: e.isPr,
        isCurrentBest: currentBests.get(e.distanceM) === e.durationSec,
      }));

      return {
        id: run.id,
        externalActivityId: run.externalActivityId.toString(),
        activityName: run.activityName,
        activityType: run.activityType,
        startTimeGmt: run.startTimeGmt.toISOString(),
        startTimeLocal: run.startTimeLocal.toISOString(),
        location: run.location,
        distanceM: run.distanceM,
        durationSec: run.durationSec,
        movingDurationSec: run.movingDurationSec,
        avgSpeedMps: run.avgSpeedMps,
        maxSpeedMps: run.maxSpeedMps,
        avgHr: run.avgHr,
        maxHr: run.maxHr,
        avgCadenceSpm: run.avgCadenceSpm,
        maxCadenceSpm: run.maxCadenceSpm,
        elevationGainM: run.elevationGainM,
        elevationLossM: run.elevationLossM,
        calories: run.calories,
        startLatitude: run.startLatitude,
        startLongitude: run.startLongitude,
        weather: run.weather
          ? {
              temperatureC: run.weather.temperatureC,
              weatherCode: run.weather.weatherCode,
              windSpeedMps: run.weather.windSpeedMps,
              windDirectionDeg: run.weather.windDirectionDeg,
            }
          : null,
        splits: run.splits.map((s) => ({
          id: s.id,
          splitIndex: s.splitIndex,
          startTimeGmt: s.startTimeGmt.toISOString(),
          distanceM: s.distanceM,
          durationSec: s.durationSec,
          avgSpeedMps: s.avgSpeedMps,
          avgHr: s.avgHr,
          maxHr: s.maxHr,
          avgCadenceSpm: s.avgCadenceSpm,
          elevationGainM: s.elevationGainM,
          elevationLossM: s.elevationLossM,
        })),
        insight,
        bestEfforts,
        hrZones: run.hrZones.map((z) => ({
          id: z.id,
          zoneNumber: z.zoneNumber,
          zoneLowBpm: z.zoneLowBpm,
          zoneHighBpm: z.zoneHighBpm,
          secondsInZone: z.secondsInZone,
        })),
        trackPoints: run.trackPoints.map((p) => ({
          id: p.id.toString(),
          pointIndex: p.pointIndex,
          elapsedSec: p.elapsedSec,
          latitude: p.latitude,
          longitude: p.longitude,
          elevationM: p.elevationM,
          heartRate: p.heartRate,
          speedMps: p.speedMps,
        })),
      };
    },

    async deleteAllRuns(userId: string, userEmail: string): Promise<number> {
      const { count } = await prisma.$transaction(async (tx) => {
        const result = await tx.run.deleteMany({ where: { userId } });
        await recordAuditLog(tx, {
          userId,
          userEmail,
          action: "RUN_DATA_DELETED",
          metadata: { count: result.count },
        });
        return result;
      });
      return count;
    },
  };
}

export type RunsService = ReturnType<typeof createRunsService>;
