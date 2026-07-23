import cookie from "@fastify/cookie";
import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";

export default fp(async (fastify: FastifyInstance) => {
  await fastify.register(cookie);
});
