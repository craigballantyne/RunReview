import type { FastifyInstance } from "fastify";
import { createMailer } from "../../lib/email.js";
import { requireAuth } from "../../middleware/require-auth.js";
import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
  verifyEmailQuerySchema,
} from "./auth.schemas.js";
import { createAuthService } from "./auth.service.js";

function toAuthUser(user: { id: string; email: string; emailVerifiedAt: Date | null }) {
  return { id: user.id, email: user.email, emailVerified: user.emailVerifiedAt !== null };
}

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  const mailer = createMailer(fastify.config);
  const authService = createAuthService({ prisma: fastify.prisma, mailer, config: fastify.config, logger: fastify.log });

  fastify.post("/signup", async (req, reply) => {
    const { email, password } = signupSchema.parse(req.body);
    const user = await authService.signup(email, password);
    await fastify.createSession(user.id, req, reply);
    reply.status(201).send({ user: toAuthUser(user) });
  });

  fastify.post("/login", async (req, reply) => {
    const { email, password } = loginSchema.parse(req.body);
    const user = await authService.login(email, password);
    await fastify.createSession(user.id, req, reply);
    reply.send({ user: toAuthUser(user) });
  });

  fastify.post("/logout", async (req, reply) => {
    if (req.sessionId) {
      await fastify.destroySession(req.sessionId, reply);
    }
    reply.status(204).send();
  });

  fastify.get("/me", async (req, reply) => {
    if (!req.user) {
      reply.send({ user: null });
      return;
    }
    reply.send({ user: req.user });
  });

  fastify.get("/verify-email", async (req, reply) => {
    const { token } = verifyEmailQuerySchema.parse(req.query);
    const user = await authService.verifyEmailByToken(token);
    await fastify.createSession(user.id, req, reply);
    reply.redirect(`${fastify.config.APP_BASE_URL}/?verified=1`);
  });

  fastify.post("/resend-verification", { preHandler: requireAuth }, async (req, reply) => {
    await authService.resendVerification(req.user!.id);
    reply.status(204).send();
  });

  fastify.post("/forgot-password", async (req, reply) => {
    const { email } = forgotPasswordSchema.parse(req.body);
    await authService.forgotPassword(email);
    reply.status(204).send();
  });

  fastify.post("/reset-password", async (req, reply) => {
    const { token, newPassword } = resetPasswordSchema.parse(req.body);
    const user = await authService.resetPassword(token, newPassword);
    await fastify.createSession(user.id, req, reply);
    reply.status(204).send();
  });
}
