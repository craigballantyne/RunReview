import type { FastifyInstance } from "fastify";
import { requireVerified } from "../../middleware/require-verified.js";
import { analysisJobIdFor } from "../../queue/analysis-queue.js";
import { LAYER1_VERSION } from "./layer1.service.js";

export async function analysisRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook("preHandler", requireVerified);

  /**
   * Starts an analysis pass over the caller's backlog.
   *
   * Deliberately explicit rather than firing automatically when an import completes: later layers
   * spend money per run, and until the pipeline has been evaluated end to end the trigger stays in
   * the user's hands. Revisit once Layers 2 and 3 are built and their output has been reviewed.
   */
  fastify.post("/", async (req, reply) => {
    const userId = req.user!.id;

    // A fixed job id per user coalesces repeated triggers: BullMQ rejects a duplicate id while the
    // job is queued or running, so double-clicking cannot start two passes over the same rows.
    await fastify.analysisQueue.add("analyse-user", { userId }, { jobId: analysisJobIdFor(userId) });

    reply.status(202).send({ status: "queued" });
  });

  fastify.get("/", async (req, reply) => {
    const userId = req.user!.id;

    const [totalRuns, byStatus, staleCount] = await Promise.all([
      fastify.prisma.run.count({ where: { userId } }),
      fastify.prisma.runInsight.groupBy({
        by: ["layer1Status"],
        where: { userId },
        _count: { _all: true },
      }),
      fastify.prisma.runInsight.count({
        where: { userId, layer1Status: "COMPLETED", layer1Version: { lt: LAYER1_VERSION } },
      }),
    ]);

    const counts = Object.fromEntries(byStatus.map((row) => [row.layer1Status, row._count._all]));
    const analysed = counts.COMPLETED ?? 0;

    reply.send({
      layer1: {
        version: LAYER1_VERSION,
        totalRuns,
        analysed,
        // Runs with no insight row at all have never been picked up, and count as pending too.
        pending: totalRuns - analysed - (counts.FAILED ?? 0),
        failed: counts.FAILED ?? 0,
        // Analysed against an older version of the computations; a pass will redo these.
        stale: staleCount,
      },
    });
  });
}
