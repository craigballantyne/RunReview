import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { createLayer2Service } from "../../src/modules/analysis/layer2.service.js";
import { MissingAnthropicKeyError, type Layer2LlmClient } from "../../src/modules/analysis/layer2-llm.js";
import { classifySegmentRoles } from "../../src/modules/analysis/segment-roles.js";
import { genericEasyRunLaps } from "../fixtures/reference-laps.js";

/** Minimal Prisma stand-in: one analysed run, with every update captured for assertion. */
function fakePrisma() {
  const updates: Record<string, unknown>[] = [];
  const prisma = {
    runInsight: {
      findUniqueOrThrow: vi.fn(async () => ({
        runId: "run-1",
        segmentRoles: classifySegmentRoles(genericEasyRunLaps, "auto"),
        rawPointFlags: { walkBreaks: [], withinLapDrift: [] },
        run: {
          activityName: "City of Edinburgh Running",
          distanceM: 10070,
          movingDurationSec: 3530,
          splits: genericEasyRunLaps.map((s) => ({ ...s, startTimeGmt: new Date(s.startTimeGmt) })),
        },
      })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        updates.push(data);
        return data;
      }),
      findMany: vi.fn(async () => [{ runId: "run-1" }]),
    },
  };
  return { prisma: prisma as unknown as PrismaClient, updates };
}

const keylessClient: Layer2LlmClient = {
  parseIntent: () => {
    throw new MissingAnthropicKeyError();
  },
};

/** The final update is the one carrying results; the first only flips status to PROCESSING. */
const resultOf = (updates: Record<string, unknown>[]) => updates[updates.length - 1]!;

describe("createLayer2Service without an API key", () => {
  it("still stores the deterministic tags", async () => {
    const { prisma, updates } = fakePrisma();
    const result = await createLayer2Service(prisma, keylessClient).analyseUser("user-1");

    expect(result).toEqual({ analysed: 1, failed: 0, intentSkipped: 1 });
    expect(resultOf(updates).workoutStructure).toBe("steady");
    expect(resultOf(updates).layer2Status).toBe("COMPLETED");
  });

  it("leaves the version unset so a later pass can backfill the intent", async () => {
    // This is what keeps "no key yet" distinguishable from "the title named no workout". Without
    // it, adding a key later would leave every existing run looking finished.
    const { prisma, updates } = fakePrisma();
    await createLayer2Service(prisma, keylessClient).analyseUser("user-1");

    expect(resultOf(updates).layer2Version).toBeNull();
  });

  it("does not write a null intent over anything", async () => {
    const { prisma, updates } = fakePrisma();
    await createLayer2Service(prisma, keylessClient).analyseUser("user-1");

    expect(resultOf(updates).parsedIntent).toBeUndefined();
  });

  it("does not treat the missing key as a run failure", async () => {
    const { prisma, updates } = fakePrisma();
    const result = await createLayer2Service(prisma, keylessClient).analyseUser("user-1");

    expect(result.failed).toBe(0);
    expect(resultOf(updates).layer2Error).toBeNull();
  });
});

describe("createLayer2Service with an API key", () => {
  const intent = { statedWorkout: "Easy 10k", plannedStructure: "easy", plannedIntensity: "easy", planWeek: null, isRace: false };
  const workingClient: Layer2LlmClient = { parseIntent: async () => ({ intent }) as never };

  it("stores the parsed intent and stamps the version", async () => {
    const { prisma, updates } = fakePrisma();
    const result = await createLayer2Service(prisma, workingClient).analyseUser("user-1");

    expect(result.intentSkipped).toBe(0);
    expect(resultOf(updates).parsedIntent).toEqual(intent);
    expect(resultOf(updates).layer2Version).toBe(1);
  });

  it("keeps the observed structure even when intent disagrees", async () => {
    // The title says easy; the run was executed as a steady effort. The tag records what happened,
    // and the gap is Layer 3's to report.
    const { prisma, updates } = fakePrisma();
    await createLayer2Service(prisma, workingClient).analyseUser("user-1");

    expect(resultOf(updates).workoutStructure).toBe("steady");
    expect((resultOf(updates).parsedIntent as typeof intent).plannedIntensity).toBe("easy");
  });
});

describe("createLayer2Service error handling", () => {
  it("records a genuine failure without abandoning the pass", async () => {
    const { prisma, updates } = fakePrisma();
    const failingClient: Layer2LlmClient = {
      parseIntent: async () => {
        throw new Error("overloaded");
      },
    };

    const result = await createLayer2Service(prisma, failingClient).analyseUser("user-1");

    expect(result).toEqual({ analysed: 0, failed: 1, intentSkipped: 0 });
    expect(resultOf(updates).layer2Status).toBe("FAILED");
    expect(resultOf(updates).layer2Error).toBe("overloaded");
  });
});
