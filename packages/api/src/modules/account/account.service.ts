import type { PrismaClient } from "@prisma/client";
import type { AccountSummary } from "@run-review/shared";
import { UnauthorizedError } from "../../lib/errors.js";
import { verifyPassword } from "../auth/password.js";
import { recordAuditLog } from "../audit/audit.service.js";

export interface AccountServiceDeps {
  prisma: PrismaClient;
}

export function createAccountService({ prisma }: AccountServiceDeps) {
  return {
    async deleteAccount(userId: string, currentPassword: string): Promise<void> {
      const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      if (!(await verifyPassword(user.passwordHash, currentPassword))) {
        throw new UnauthorizedError("Current password is incorrect");
      }

      await prisma.$transaction(async (tx) => {
        await recordAuditLog(tx, { userId: user.id, userEmail: user.email, action: "ACCOUNT_DELETED" });
        await tx.user.delete({ where: { id: userId } });
      });
    },

    async getSummary(userId: string): Promise<AccountSummary> {
      const [totalRuns, lastRun] = await Promise.all([
        prisma.run.count({ where: { userId } }),
        prisma.run.findFirst({
          where: { userId },
          orderBy: { startTimeGmt: "desc" },
          select: { startTimeGmt: true },
        }),
      ]);

      return {
        totalRuns,
        lastRunDate: lastRun ? lastRun.startTimeGmt.toISOString() : null,
      };
    },
  };
}

export type AccountService = ReturnType<typeof createAccountService>;
