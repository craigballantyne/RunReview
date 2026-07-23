import cors from "@fastify/cors";
import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";

export default fp(async (fastify: FastifyInstance) => {
  await fastify.register(cors, {
    origin: fastify.config.APP_BASE_URL,
    credentials: true,
  });
});
