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
import { routePlannerRoutes } from "./modules/route-planner/route-planner.routes.js";

export async function buildApp(): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: {
      level: process.env.NODE_ENV === "test" ? "silent" : "info",
      transport: process.env.NODE_ENV === "development" ? { target: "pino-pretty" } : undefined,
    },
  });

  // Must run before any fastify.register() calls below: Fastify's encapsulation model doesn't
  // retroactively propagate setErrorHandler into already-registered child plugin contexts (each
  // route module below is its own encapsulated child via register()) — calling this after they're
  // registered silently leaves every one of them on Fastify's own default error handler instead,
  // which is why every error response was showing Fastify's default shape rather than this one
  // (confirmed via a minimal reproduction against this exact Fastify version).
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
  await fastify.register(routePlannerRoutes, { prefix: "/api/route-planner" });

  fastify.get("/api/health", async () => ({ status: "ok" }));

  return fastify;
}
