import type { FastifyInstance } from "fastify";
import { requireVerified } from "../../middleware/require-verified.js";
import { createRecordsService } from "./records.service.js";

export async function recordsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook("preHandler", requireVerified);

  const records = createRecordsService(fastify.prisma);

  fastify.get("/", async (req, reply) => {
    reply.send({ distances: await records.getRecords(req.user!.id) });
  });
}
