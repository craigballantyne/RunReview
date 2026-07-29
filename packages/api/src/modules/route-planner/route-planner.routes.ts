import type { FastifyInstance } from "fastify";
import { requireVerified } from "../../middleware/require-verified.js";
import { AppError } from "../../lib/errors.js";
import { createGeocoder } from "../import/geocode.js";
import { createRouteService, RouteCalculationError } from "./openroute.js";
import { createRoutePlannerService } from "./route-planner.service.js";
import { calculateRouteSchema, snapPointSchema } from "./route-planner.schemas.js";

export async function routePlannerRoutes(fastify: FastifyInstance): Promise<void> {
  const geocoder = createGeocoder(fastify.prisma, fastify.config);
  const routeService = createRouteService(fastify.config);
  const routePlannerService = createRoutePlannerService({ prisma: fastify.prisma, routeService, geocoder });

  fastify.addHook("preHandler", requireVerified);

  fastify.post("/snap", async (req, reply) => {
    const { lat, lon, includeLocation } = snapPointSchema.parse(req.body);
    const result = await routePlannerService.snapPoint(lat, lon, includeLocation);
    reply.send(result);
  });

  fastify.post("/route", async (req, reply) => {
    const { points } = calculateRouteSchema.parse(req.body);
    try {
      const result = await routePlannerService.calculateRoute(points);
      reply.send(result);
    } catch (err) {
      if (err instanceof RouteCalculationError) {
        throw new AppError(502, "ROUTE_CALCULATION_FAILED", err.message);
      }
      throw err;
    }
  });

  fastify.get("/heatmap", async (req, reply) => {
    const points = await routePlannerService.getHeatmapPoints(req.user!.id);
    reply.send({ points });
  });
}
