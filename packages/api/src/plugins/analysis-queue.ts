import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { createRedisConnection } from "../queue/connection.js";
import { createAnalysisQueue, type AnalysisJobData } from "../queue/analysis-queue.js";
import type { Queue } from "bullmq";

declare module "fastify" {
  interface FastifyInstance {
    analysisQueue: Queue<AnalysisJobData>;
  }
}

export default fp(async (fastify: FastifyInstance) => {
  const connection = createRedisConnection(fastify.config);
  const queue = createAnalysisQueue(connection);

  fastify.decorate("analysisQueue", queue);

  fastify.addHook("onClose", async () => {
    await queue.close();
    await connection.quit();
  });
});
