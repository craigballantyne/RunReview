import type { AuditAction, Prisma, PrismaClient } from "@prisma/client";

type PrismaTx = Prisma.TransactionClient | PrismaClient;

export async function recordAuditLog(
  tx: PrismaTx,
  params: { userId: string | null; userEmail: string; action: AuditAction; metadata?: Record<string, unknown> },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      userId: params.userId,
      userEmail: params.userEmail,
      action: params.action,
      metadata: params.metadata as Prisma.InputJsonValue | undefined,
    },
  });
}
