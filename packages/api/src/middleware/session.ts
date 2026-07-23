import fp from "fastify-plugin";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AuthUser } from "@run-review/shared";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

declare module "fastify" {
  interface FastifyInstance {
    createSession(userId: string, req: FastifyRequest, reply: FastifyReply): Promise<string>;
    destroySession(sessionId: string, reply: FastifyReply): Promise<void>;
    destroyAllSessionsForUser(userId: string): Promise<void>;
  }
  interface FastifyRequest {
    user: AuthUser | null;
    sessionId: string | null;
  }
}

export default fp(async (fastify: FastifyInstance) => {
  function setSessionCookie(reply: FastifyReply, sessionId: string, expiresAt: Date) {
    reply.setCookie(fastify.config.SESSION_COOKIE_NAME, sessionId, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: fastify.config.NODE_ENV === "production",
      expires: expiresAt,
      signed: false,
    });
  }

  fastify.decorate("createSession", async (userId: string, req: FastifyRequest, reply: FastifyReply) => {
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    const session = await fastify.prisma.session.create({
      data: {
        userId,
        expiresAt,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"] ?? null,
      },
    });
    setSessionCookie(reply, session.id, expiresAt);
    return session.id;
  });

  fastify.decorate("destroySession", async (sessionId: string, reply: FastifyReply) => {
    await fastify.prisma.session.deleteMany({ where: { id: sessionId } });
    reply.clearCookie(fastify.config.SESSION_COOKIE_NAME, { path: "/" });
  });

  fastify.decorate("destroyAllSessionsForUser", async (userId: string) => {
    await fastify.prisma.session.deleteMany({ where: { userId } });
  });

  fastify.decorateRequest("user", null);
  fastify.decorateRequest("sessionId", null);

  fastify.addHook("onRequest", async (req) => {
    const sessionId = req.cookies[fastify.config.SESSION_COOKIE_NAME];
    if (!sessionId) return;

    const session = await fastify.prisma.session.findUnique({
      where: { id: sessionId },
      include: { user: true },
    });

    if (!session || session.expiresAt < new Date()) {
      if (session) {
        await fastify.prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
      }
      return;
    }

    req.sessionId = session.id;
    req.user = {
      id: session.user.id,
      email: session.user.email,
      emailVerified: session.user.emailVerifiedAt !== null,
    };
  });
});
