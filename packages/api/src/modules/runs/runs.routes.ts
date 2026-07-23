import type { FastifyInstance } from "fastify";
import { requireVerified } from "../../middleware/require-verified.js";
import { listRunsQuerySchema, runIdParamsSchema } from "./runs.schemas.js";
import { createRunsService } from "./runs.service.js";

export async function runsRoutes(fastify: FastifyInstance): Promise<void> {
  const runsService = createRunsService({ prisma: fastify.prisma });

  fastify.addHook("preHandler", requireVerified);

  fastify.get("/", async (req, reply) => {
    const { cursor, limit } = listRunsQuerySchema.parse(req.query);
    const page = await runsService.listRuns(req.user!.id, limit, cursor);
    reply.send(page);
  });

  fastify.get("/:id", async (req, reply) => {
    const { id } = runIdParamsSchema.parse(req.params);
    const run = await runsService.getRunDetail(req.user!.id, id);
    reply.send(run);
  });

  fastify.delete("/", async (req, reply) => {
    await runsService.deleteAllRuns(req.user!.id, req.user!.email);
    reply.status(204).send();
  });
}
