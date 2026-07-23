import rateLimit from "@fastify/rate-limit";
import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";

/**
 * Global soft ceiling. Tighter, endpoint-specific limits (login, signup,
 * forgot-password) are applied per-route via the `config.rateLimit` route option.
 */
export default fp(async (fastify: FastifyInstance) => {
  await fastify.register(rateLimit, {
    max: 200,
    timeWindow: "1 minute",
  });
});
