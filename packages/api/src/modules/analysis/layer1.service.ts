import type { Prisma, PrismaClient } from "@prisma/client";
import type { HrZone, Split, TrackPoint } from "@run-review/shared";
import { detectBestEfforts, markPersonalRecords } from "./best-efforts.js";
import { buildDistanceChannel } from "./distance-channel.js";
import { classifyElevationBucket, computeElevationGainM } from "./elevation.js";
import { summariseHrZones } from "./hr-zones.js";
import { detectLapMode } from "./lap-mode.js";
import { detectRawPointFlags } from "./raw-point-flags.js";
import { classifyRunTypeByDistance, ROLLING_WINDOW_DAYS } from "./run-type.js";
import { classifySegmentRoles } from "./segment-roles.js";
import { classifySplitPattern } from "./split-pattern.js";
import { computeWeatherFlags } from "./weather-flags.js";

/**
 * Bumped whenever a Layer 1 computation changes in a way that would produce different output for
 * the same run. Rows below the current version are re-analysed; rows at it are left alone, so a
 * re-run is idempotent and cheap.
 */
export const LAYER1_VERSION = 2;

const MS_PER_DAY = 86_400_000;

interface Layer1Logger {
  info: (obj: object, msg: string) => void;
  warn: (obj: object, msg: string) => void;
  error: (obj: object, msg: string) => void;
}

const NOOP_LOGGER: Layer1Logger = { info: () => {}, warn: () => {}, error: () => {} };

/**
 * Prisma's `InputJsonValue` requires an index signature, which `interface` declarations don't
 * carry (unlike `Record`/type aliases). Everything passed through here is plain serialisable data
 * defined in `@run-review/shared`, so the assertion is safe — kept in one place rather than
 * repeated at each call site.
 */
function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

/** Prisma rows carry `Date` and `BigInt` where the shared analysis types expect `string`. */
function toSharedSplit(row: {
  id: string;
  splitIndex: number;
  startTimeGmt: Date;
  distanceM: number;
  durationSec: number;
  avgSpeedMps: number | null;
  avgHr: number | null;
  maxHr: number | null;
  avgCadenceSpm: number | null;
  elevationGainM: number | null;
  elevationLossM: number | null;
}): Split {
  return { ...row, startTimeGmt: row.startTimeGmt.toISOString() };
}

function toSharedTrackPoint(row: {
  id: bigint;
  pointIndex: number;
  elapsedSec: number;
  latitude: number | null;
  longitude: number | null;
  elevationM: number | null;
  heartRate: number | null;
  speedMps: number | null;
}): TrackPoint {
  return { ...row, id: row.id.toString() };
}

function toSharedHrZone(row: {
  id: string;
  zoneNumber: number;
  zoneLowBpm: number | null;
  zoneHighBpm: number | null;
  secondsInZone: number;
}): HrZone {
  return row;
}

export function createLayer1Service(prisma: PrismaClient, logger: Layer1Logger = NOOP_LOGGER) {
  /**
   * Point-in-time snapshots are only valid if every earlier run was analysed first. Importing a
   * run that predates already-analysed runs silently invalidates all of them, so before a pass
   * begins, anything after the earliest un-analysed run is reset to PENDING.
   *
   * Self-healing by construction: during a normal oldest-first pass the earliest un-analysed run
   * moves steadily forward, so this is a no-op after the first call. Layer 1 has no LLM cost, which
   * is what makes re-running it the cheap and correct response to an out-of-order import.
   */
  async function invalidateOutOfOrder(userId: string): Promise<number> {
    const earliestUnanalysed = await prisma.run.findFirst({
      where: {
        userId,
        OR: [{ insight: { is: null } }, { insight: { layer1Version: { lt: LAYER1_VERSION } } }],
      },
      orderBy: { startTimeGmt: "asc" },
      select: { startTimeGmt: true },
    });
    if (!earliestUnanalysed) return 0;

    const { count } = await prisma.runInsight.updateMany({
      where: {
        userId,
        layer1Status: "COMPLETED",
        run: { startTimeGmt: { gt: earliestUnanalysed.startTimeGmt } },
      },
      data: { layer1Status: "PENDING" },
    });

    if (count > 0) {
      // Two causes reach here: a genuinely out-of-order import, and a version bump that makes
      // every row stale at once. Both are handled identically, so the message names the effect
      // rather than guessing at the cause.
      logger.info(
        { userId, count, from: earliestUnanalysed.startTimeGmt },
        "reset later insights to pending — earlier run needs analysis",
      );
    }
    return count;
  }

  async function analyseRun(runId: string): Promise<void> {
    const run = await prisma.run.findUniqueOrThrow({
      where: { id: runId },
      include: {
        splits: { orderBy: { splitIndex: "asc" } },
        hrZones: { orderBy: { zoneNumber: "asc" } },
        trackPoints: { orderBy: { pointIndex: "asc" } },
        weather: true,
      },
    });

    await prisma.runInsight.upsert({
      where: { runId },
      create: { runId, userId: run.userId, layer1Status: "PROCESSING" },
      update: { layer1Status: "PROCESSING", layer1Error: null },
    });

    const splits = run.splits.map(toSharedSplit);
    const trackPoints = run.trackPoints.map(toSharedTrackPoint);
    const hrZones = run.hrZones.map(toSharedHrZone);

    const channel = buildDistanceChannel(trackPoints, run.distanceM);
    const { lapMode, lapModeSource } = detectLapMode(splits);
    const segments = classifySegmentRoles(splits, lapMode);
    const elevationGainM = computeElevationGainM(trackPoints);
    const hrZoneSummary = summariseHrZones(hrZones);
    const weatherFlags = computeWeatherFlags(run.weather);
    const rawPointFlags = detectRawPointFlags(channel, splits, run.startTimeGmt);

    // History strictly preceding this run — what makes every field below a point-in-time fact.
    const windowStart = new Date(run.startTimeGmt.getTime() - ROLLING_WINDOW_DAYS * MS_PER_DAY);
    const priorRuns = await prisma.run.findMany({
      where: { userId: run.userId, startTimeGmt: { gte: windowStart, lt: run.startTimeGmt } },
      select: { distanceM: true },
    });
    const priorBests = await prisma.runBestEffort.groupBy({
      by: ["distanceM"],
      where: { userId: run.userId, startTimeGmt: { lt: run.startTimeGmt } },
      _min: { durationSec: true },
    });

    const previousBestByDistanceM = new Map<number, number>();
    for (const row of priorBests) {
      if (row._min.durationSec !== null) previousBestByDistanceM.set(row.distanceM, row._min.durationSec);
    }

    const bestEfforts = markPersonalRecords(detectBestEfforts(channel), previousBestByDistanceM);

    await prisma.$transaction([
      prisma.runBestEffort.deleteMany({ where: { runId } }),
      prisma.runBestEffort.createMany({
        data: bestEfforts.map((effort) => ({
          runId,
          userId: run.userId,
          distanceM: effort.distanceM,
          durationSec: effort.durationSec,
          startOffsetM: effort.startOffsetM,
          isPr: effort.isPr,
          startTimeGmt: run.startTimeGmt,
        })),
      }),
      prisma.runInsight.update({
        where: { runId },
        data: {
          layer1Status: "COMPLETED",
          layer1Version: LAYER1_VERSION,
          layer1ComputedAt: new Date(),
          layer1Error: null,
          lapMode,
          lapModeSource,
          runTypeByDistance: classifyRunTypeByDistance(
            run.distanceM,
            priorRuns.map((r) => r.distanceM),
          ),
          hrZone: hrZoneSummary.dominant,
          hrZoneDistribution: hrZoneSummary.distribution,
          splitPattern: classifySplitPattern(channel, lapMode),
          elevationBucket: classifyElevationBucket(elevationGainM, run.distanceM),
          elevationGainM,
          tempBucket: weatherFlags.tempBucket,
          humidityFlag: weatherFlags.humidityFlag,
          windFlag: weatherFlags.windFlag,
          heatStress: weatherFlags.heatStress,
          segmentRoles: toJson(segments),
          rawPointFlags: toJson(rawPointFlags),
        },
      }),
    ]);
  }

  /**
   * Runs Layer 1 across a user's backlog, oldest run first.
   *
   * The ordering is load-bearing for exactly one field: `isPr` compares against best efforts
   * already stored for earlier runs. Everything else reads raw imported data and would be
   * order-independent — but the whole pass is ordered anyway, because a partially-ordered pass is
   * harder to reason about than a uniformly ordered one.
   */
  async function analyseUser(userId: string): Promise<{ analysed: number; failed: number }> {
    await invalidateOutOfOrder(userId);

    const pending = await prisma.run.findMany({
      where: {
        userId,
        OR: [
          { insight: { is: null } },
          { insight: { layer1Status: { in: ["PENDING", "FAILED"] } } },
          { insight: { layer1Version: { lt: LAYER1_VERSION } } },
        ],
      },
      orderBy: { startTimeGmt: "asc" },
      select: { id: true },
    });

    let analysed = 0;
    let failed = 0;

    for (const { id } of pending) {
      try {
        await analyseRun(id);
        analysed++;
      } catch (err) {
        failed++;
        logger.error({ runId: id, err }, "layer 1 analysis failed");
        // Recorded rather than thrown: one unanalysable run must not abandon the rest of the
        // backlog, and a FAILED row is retried on the next pass.
        await prisma.runInsight
          .upsert({
            where: { runId: id },
            create: {
              runId: id,
              userId,
              layer1Status: "FAILED",
              layer1Error: err instanceof Error ? err.message : String(err),
            },
            update: { layer1Status: "FAILED", layer1Error: err instanceof Error ? err.message : String(err) },
          })
          .catch((updateErr) => logger.warn({ runId: id, err: updateErr }, "could not record layer 1 failure"));
      }
    }

    logger.info({ userId, analysed, failed }, "layer 1 pass complete");
    return { analysed, failed };
  }

  return { analyseRun, analyseUser, invalidateOutOfOrder };
}

export type Layer1Service = ReturnType<typeof createLayer1Service>;
