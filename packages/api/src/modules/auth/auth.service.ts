import type { PrismaClient } from "@prisma/client";
import type { Mailer } from "../../lib/email.js";
import type { Env } from "../../config/env.js";
import { AppError, ConflictError, UnauthorizedError, ValidationError } from "../../lib/errors.js";
import { recordAuditLog } from "../audit/audit.service.js";
import { generateRawToken, hashPassword, hashToken, verifyPassword } from "./password.js";

const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hour
const RESEND_VERIFICATION_COOLDOWN_MS = 60 * 1000; // 60 seconds

export interface AuthServiceLogger {
  warn(obj: unknown, msg?: string): void;
}

export interface AuthServiceDeps {
  prisma: PrismaClient;
  mailer: Mailer;
  config: Env;
  logger?: AuthServiceLogger;
}

export function createAuthService({ prisma, mailer, config, logger = console }: AuthServiceDeps) {
  async function issueToken(userId: string, type: "EMAIL_VERIFICATION" | "PASSWORD_RESET", ttlMs: number) {
    const rawToken = generateRawToken();
    await prisma.authToken.create({
      data: {
        userId,
        type,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + ttlMs),
      },
    });
    return rawToken;
  }

  async function sendVerificationEmail(userId: string, email: string) {
    const rawToken = await issueToken(userId, "EMAIL_VERIFICATION", EMAIL_VERIFICATION_TTL_MS);
    const verifyUrl = `${config.API_BASE_URL}/api/auth/verify-email?token=${rawToken}`;
    try {
      await mailer.sendVerificationEmail(email, verifyUrl);
    } catch (err) {
      // Email delivery failing shouldn't fail account creation/resend — the account is real and
      // usable, the user just needs to try "resend verification" again once delivery is fixed.
      logger.warn({ err, userId }, "failed to send verification email");
    }
  }

  return {
    async signup(email: string, password: string) {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        throw new ConflictError("An account with this email already exists");
      }

      const passwordHash = await hashPassword(password);
      const user = await prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            email,
            passwordHash,
            // With verification disabled (dev/test convenience), skip the email loop entirely
            // and mark the account verified at creation so it behaves as if the link was clicked.
            emailVerifiedAt: config.FEATURE_EMAIL_VERIFICATION ? null : new Date(),
          },
        });
        await recordAuditLog(tx, { userId: created.id, userEmail: created.email, action: "ACCOUNT_CREATED" });
        return created;
      });

      if (config.FEATURE_EMAIL_VERIFICATION) {
        await sendVerificationEmail(user.id, user.email);
      }

      return user;
    },

    async login(email: string, password: string) {
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user || !(await verifyPassword(user.passwordHash, password))) {
        throw new UnauthorizedError("Invalid email or password");
      }
      return user;
    },

    async verifyEmailByToken(rawToken: string) {
      const tokenHash = hashToken(rawToken);
      const authToken = await prisma.authToken.findUnique({ where: { tokenHash } });

      if (
        !authToken ||
        authToken.type !== "EMAIL_VERIFICATION" ||
        authToken.usedAt !== null ||
        authToken.expiresAt < new Date()
      ) {
        throw new AppError(400, "INVALID_TOKEN", "This verification link is invalid or has expired");
      }

      const user = await prisma.$transaction(async (tx) => {
        await tx.authToken.update({ where: { id: authToken.id }, data: { usedAt: new Date() } });
        return tx.user.update({ where: { id: authToken.userId }, data: { emailVerifiedAt: new Date() } });
      });

      return user;
    },

    async resendVerification(userId: string) {
      const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      if (user.emailVerifiedAt) {
        throw new ValidationError("This account is already verified");
      }

      const latestToken = await prisma.authToken.findFirst({
        where: { userId, type: "EMAIL_VERIFICATION" },
        orderBy: { createdAt: "desc" },
      });
      if (latestToken && Date.now() - latestToken.createdAt.getTime() < RESEND_VERIFICATION_COOLDOWN_MS) {
        throw new AppError(429, "TOO_MANY_REQUESTS", "Please wait before requesting another verification email");
      }

      await sendVerificationEmail(user.id, user.email);
    },

    async forgotPassword(email: string) {
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) return; // Deliberately silent: avoids revealing whether an account exists.

      const rawToken = await issueToken(user.id, "PASSWORD_RESET", PASSWORD_RESET_TTL_MS);
      const resetUrl = `${config.APP_BASE_URL}/reset-password?token=${rawToken}`;
      try {
        await mailer.sendPasswordResetEmail(user.email, resetUrl);
      } catch (err) {
        logger.warn({ err, userId: user.id }, "failed to send password reset email");
      }
    },

    async resetPassword(rawToken: string, newPassword: string) {
      const tokenHash = hashToken(rawToken);
      const authToken = await prisma.authToken.findUnique({ where: { tokenHash } });

      if (
        !authToken ||
        authToken.type !== "PASSWORD_RESET" ||
        authToken.usedAt !== null ||
        authToken.expiresAt < new Date()
      ) {
        throw new AppError(400, "INVALID_TOKEN", "This password reset link is invalid or has expired");
      }

      const passwordHash = await hashPassword(newPassword);
      const user = await prisma.$transaction(async (tx) => {
        await tx.authToken.update({ where: { id: authToken.id }, data: { usedAt: new Date() } });
        const updated = await tx.user.update({ where: { id: authToken.userId }, data: { passwordHash } });
        await tx.session.deleteMany({ where: { userId: updated.id } });
        await recordAuditLog(tx, { userId: updated.id, userEmail: updated.email, action: "PASSWORD_RESET" });
        return updated;
      });

      return user;
    },

    async changePassword(userId: string, currentPassword: string, newPassword: string) {
      const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      if (!(await verifyPassword(user.passwordHash, currentPassword))) {
        throw new UnauthorizedError("Current password is incorrect");
      }

      const passwordHash = await hashPassword(newPassword);
      await prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id: userId }, data: { passwordHash } });
        await recordAuditLog(tx, { userId, userEmail: user.email, action: "PASSWORD_UPDATED" });
      });
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
