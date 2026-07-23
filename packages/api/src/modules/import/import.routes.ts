import { createWriteStream } from "node:fs";
import { mkdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireVerified } from "../../middleware/require-verified.js";
import { NotFoundError, ValidationError } from "../../lib/errors.js";

const jobIdParamsSchema = z.object({ id: z.string().uuid() });

export async function importRoutes(fastify: FastifyInstance): Promise<void> {
  await mkdir(fastify.config.IMPORT_UPLOAD_DIR, { recursive: true });

  fastify.addHook("preHandler", requireVerified);

  fastify.post("/", async (req, reply) => {
    const file = await req.file();
    if (!file) {
      throw new ValidationError("No file was uploaded");
    }
    if (file.fieldname !== "file" && file.mimetype !== "application/json" && !file.filename.endsWith(".json")) {
      // Not a hard rejection (some clients omit/guess mimetype) — logged for visibility only.
      req.log.warn({ mimetype: file.mimetype, filename: file.filename }, "unexpected import file type");
    }

    const importJob = await fastify.prisma.importJob.create({
      data: { userId: req.user!.id, fileName: file.filename, status: "PENDING" },
    });

    const filePath = join(fastify.config.IMPORT_UPLOAD_DIR, `${importJob.id}.json`);

    await pipeline(file.file, createWriteStream(filePath));

    if (file.file.truncated) {
      await unlink(filePath).catch(() => undefined);
      await fastify.prisma.importJob.update({
        where: { id: importJob.id },
        data: {
          status: "FAILED",
          errorMessage: "The file exceeds the 256MB import size limit",
          completedAt: new Date(),
        },
      });
      reply.status(413).send({ error: { code: "FILE_TOO_LARGE", message: "The file exceeds the 256MB import size limit" } });
      return;
    }

    const { size } = await stat(filePath);
    await fastify.prisma.importJob.update({ where: { id: importJob.id }, data: { fileSizeBytes: BigInt(size) } });

    await fastify.importQueue.add(
      "process-import",
      { importJobId: importJob.id, filePath },
      { jobId: importJob.id },
    );

    reply.status(202).send({ importJobId: importJob.id });
  });

  fastify.get("/:id", async (req, reply) => {
    const { id } = jobIdParamsSchema.parse(req.params);
    const job = await fastify.prisma.importJob.findFirst({ where: { id, userId: req.user!.id } });
    if (!job) {
      throw new NotFoundError("Import job not found");
    }

    reply.send({
      id: job.id,
      status: job.status,
      totalActivities: job.totalActivities,
      processedActivities: job.processedActivities,
      importedCount: job.importedCount,
      skippedCount: job.skippedCount,
      skippedDetails: job.skippedDetails,
      errorMessage: job.errorMessage,
    });
  });
}
