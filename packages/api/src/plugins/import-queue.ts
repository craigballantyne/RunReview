import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { createRedisConnection } from "../queue/connection.js";
import { createImportQueue, type ImportJobData } from "../queue/import-queue.js";
import type { Queue } from "bullmq";

declare module "fastify" {
  interface FastifyInstance {
    importQueue: Queue<ImportJobData>;
  }
}

export default fp(async (fastify: FastifyInstance) => {
  const connection = createRedisConnection(fastify.config);
  const queue = createImportQueue(connection);

  fastify.decorate("importQueue", queue);

  fastify.addHook("onClose", async () => {
    await queue.close();
    await connection.quit();
  });
});
