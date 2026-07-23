import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { loadEnv, type Env } from "../config/env.js";

declare module "fastify" {
  interface FastifyInstance {
    config: Env;
  }
}

export default fp(async (fastify: FastifyInstance) => {
  fastify.decorate("config", loadEnv());
});
