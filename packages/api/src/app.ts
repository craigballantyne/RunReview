import Fastify, { type FastifyInstance } from "fastify";
import { ZodError } from "zod";
import configPlugin from "./plugins/config.js";
import prismaPlugin from "./plugins/prisma.js";
import cookiePlugin from "./plugins/cookie.js";
import corsPlugin from "./plugins/cors.js";
import multipartPlugin from "./plugins/multipart.js";
import rateLimitPlugin from "./plugins/rate-limit.js";
import importQueuePlugin from "./plugins/import-queue.js";
import sessionPlugin from "./middleware/session.js";
import { AppError } from "./lib/errors.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { accountRoutes } from "./modules/account/account.routes.js";
import { runsRoutes } from "./modules/runs/runs.routes.js";
import { importRoutes } from "./modules/import/import.routes.js";

export async function buildApp(): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: {
      level: process.env.NODE_ENV === "test" ? "silent" : "info",
      transport: process.env.NODE_ENV === "development" ? { target: "pino-pretty" } : undefined,
    },
  });

  await fastify.register(configPlugin);
  await fastify.register(prismaPlugin);
  await fastify.register(cookiePlugin);
  await fastify.register(corsPlugin);
  await fastify.register(multipartPlugin);
  await fastify.register(rateLimitPlugin);
  await fastify.register(importQueuePlugin);
  await fastify.register(sessionPlugin);

  await fastify.register(authRoutes, { prefix: "/api/auth" });
  await fastify.register(accountRoutes, { prefix: "/api/account" });
  await fastify.register(runsRoutes, { prefix: "/api/runs" });
  await fastify.register(importRoutes, { prefix: "/api/import" });

  fastify.get("/api/health", async () => ({ status: "ok" }));

  fastify.setErrorHandler((error, _req, reply) => {
    if (error instanceof AppError) {
      reply.status(error.statusCode).send({ error: { code: error.code, message: error.message } });
      return;
    }
    if (error instanceof ZodError) {
      reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "Invalid request", details: error.flatten() },
      });
      return;
    }
    if (error.statusCode && error.statusCode < 500) {
      reply.status(error.statusCode).send({ error: { code: "REQUEST_ERROR", message: error.message } });
      return;
    }
    fastify.log.error(error);
    reply.status(500).send({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
  });

  return fastify;
}
