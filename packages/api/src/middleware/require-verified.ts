import type { FastifyReply, FastifyRequest } from "fastify";
import { ForbiddenError, UnauthorizedError } from "../lib/errors.js";

/** Assumes requireAuth already ran (or runs it implicitly by also checking req.user). */
export async function requireVerified(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError();
  }
  if (!req.user.emailVerified) {
    throw new ForbiddenError("Email verification required");
  }
}
