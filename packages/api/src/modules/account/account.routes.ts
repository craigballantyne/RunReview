import type { FastifyInstance } from "fastify";
import { createMailer } from "../../lib/email.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { changePasswordSchema, deleteAccountSchema } from "../auth/auth.schemas.js";
import { createAuthService } from "../auth/auth.service.js";
import { createAccountService } from "./account.service.js";

export async function accountRoutes(fastify: FastifyInstance): Promise<void> {
  const mailer = createMailer(fastify.config);
  const authService = createAuthService({ prisma: fastify.prisma, mailer, config: fastify.config, logger: fastify.log });
  const accountService = createAccountService({ prisma: fastify.prisma });

  fastify.addHook("preHandler", requireAuth);

  fastify.get("/summary", async (req, reply) => {
    const summary = await accountService.getSummary(req.user!.id);
    reply.send(summary);
  });

  fastify.post("/password", async (req, reply) => {
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
    await authService.changePassword(req.user!.id, currentPassword, newPassword);
    // Force re-login everywhere except the current session, mirroring the reset-password flow's session invalidation.
    await fastify.prisma.session.deleteMany({ where: { userId: req.user!.id, id: { not: req.sessionId! } } });
    reply.status(204).send();
  });

  fastify.delete("/", async (req, reply) => {
    const { currentPassword } = deleteAccountSchema.parse(req.body);
    await accountService.deleteAccount(req.user!.id, currentPassword);
    reply.clearCookie(fastify.config.SESSION_COOKIE_NAME, { path: "/" });
    reply.status(204).send();
  });
}
