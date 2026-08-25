import type { PrismaClient } from "@prisma/client";
import type { RawPointFlags, SegmentClassification, Split } from "@run-review/shared";
import { computeLayer2Tags } from "./layer2-tags.js";
import { LAYER2_VERSION, MissingAnthropicKeyError, type Layer2LlmClient } from "./layer2-llm.js";
import { toJson } from "./prisma-json.js";

interface Layer2Logger {
  info: (obj: object, msg: string) => void;
  warn: (obj: object, msg: string) => void;
  error: (obj: object, msg: string) => void;
}

const NOOP_LOGGER: Layer2Logger = { info: () => {}, warn: () => {}, error: () => {} };

const EMPTY_FLAGS: RawPointFlags = { walkBreaks: [], withinLapDrift: [] };

export interface Layer2Result {
  analysed: number;
  failed: number;
  /** Runs whose tags were stored but whose intent parsing was skipped for want of an API key. */
  intentSkipped: number;
}

export function createLayer2Service(prisma: PrismaClient, llm: Layer2LlmClient, logger: Layer2Logger = NOOP_LOGGER) {
  /**
   * Reads Layer 1's stored `segmentRoles` and `rawPointFlags` rather than recomputing them.
   *
   * Keeps the two layers independently versionable: a Layer 2 threshold change re-runs only
   * Layer 2, and doesn't force a re-derivation of segment roles that haven't changed.
   */
  async function analyseRun(runId: string): Promise<{ intentSkipped: boolean }> {
    const insight = await prisma.runInsight.findUniqueOrThrow({
      where: { runId },
      include: { run: { include: { splits: { orderBy: { splitIndex: "asc" } } } } },
    });

    const segments = (insight.segmentRoles ?? []) as unknown as SegmentClassification[];
    if (!Array.isArray(segments) || segments.length === 0) {
      throw new Error("Layer 1 stored no segment roles for this run");
    }

    const splits: Split[] = insight.run.splits.map((s) => ({ ...s, startTimeGmt: s.startTimeGmt.toISOString() }));
    const rawPointFlags = (insight.rawPointFlags ?? EMPTY_FLAGS) as unknown as RawPointFlags;

    await prisma.runInsight.update({
      where: { runId },
      data: { layer2Status: "PROCESSING", layer2Error: null },
    });

    const tags = computeLayer2Tags({ segments, splits, rawPointFlags });

    // Intent parsing is the only part of this layer that costs money. Without a key the tags are
    // still worth storing, so the failure is scoped to the intent step rather than the run.
    let parsedIntent = null;
    let intentSkipped = false;
    try {
      const result = await llm.parseIntent({
        activityName: insight.run.activityName,
        distanceM: insight.run.distanceM,
        movingDurationSec: insight.run.movingDurationSec,
        computedTags: tags,
        segments,
      });
      parsedIntent = result.intent;
    } catch (err) {
      if (!(err instanceof MissingAnthropicKeyError)) throw err;
      intentSkipped = true;
    }

    await prisma.runInsight.update({
      where: { runId },
      data: {
        layer2Status: "COMPLETED",
        // Left unset when intent was skipped, so a later pass — once a key exists — picks this run
        // up rather than treating it as finished. Without this, a null `parsedIntent` would be
        // indistinguishable from "the title genuinely named no workout".
        layer2Version: intentSkipped ? null : LAYER2_VERSION,
        layer2ComputedAt: new Date(),
        layer2Error: null,
        workoutStructure: tags.workoutStructure,
        warmupCooldownDetected: tags.warmupCooldownDetected,
        walkBreakPattern: tags.walkBreakPattern,
        effortPaceMismatch: tags.effortPaceMismatch,
        fadeDetected: tags.fadeDetected,
        surgePattern: tags.surgePattern,
        evenEffortDespiteTerrain: tags.evenEffortDespiteTerrain,
        layer2Evidence: toJson(tags.evidence),
        parsedIntent: parsedIntent === null ? undefined : toJson(parsedIntent),
      },
    });

    return { intentSkipped };
  }

  /**
   * Runs Layer 2 across a user's analysed runs.
   *
   * Unlike Layer 1 this has no ordering constraint — every tag depends only on the run's own
   * Layer 1 output. It stays a sequential loop for now because the deterministic half is fast and
   * nothing else is contending; the parallelism worth having is on the intent call, once that runs.
   */
  async function analyseUser(userId: string): Promise<Layer2Result> {
    const pending = await prisma.runInsight.findMany({
      where: {
        userId,
        layer1Status: "COMPLETED",
        OR: [
          { layer2Status: { in: ["PENDING", "FAILED"] } },
          { layer2Version: null },
          { layer2Version: { lt: LAYER2_VERSION } },
        ],
      },
      orderBy: { run: { startTimeGmt: "asc" } },
      select: { runId: true },
    });

    let analysed = 0;
    let failed = 0;
    let intentSkipped = 0;

    for (const { runId } of pending) {
      try {
        const result = await analyseRun(runId);
        analysed++;
        if (result.intentSkipped) intentSkipped++;
      } catch (err) {
        failed++;
        logger.error({ runId, err }, "layer 2 analysis failed");
        await prisma.runInsight
          .update({
            where: { runId },
            data: { layer2Status: "FAILED", layer2Error: err instanceof Error ? err.message : String(err) },
          })
          .catch((updateErr) => logger.warn({ runId, err: updateErr }, "could not record layer 2 failure"));
      }
    }

    if (intentSkipped > 0) {
      logger.warn({ userId, intentSkipped }, "stored layer 2 tags without intent — no ANTHROPIC_API_KEY configured");
    }
    logger.info({ userId, analysed, failed, intentSkipped }, "layer 2 pass complete");
    return { analysed, failed, intentSkipped };
  }

  return { analyseRun, analyseUser };
}

export type Layer2Service = ReturnType<typeof createLayer2Service>;
