import { unlink } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { Worker } from "bullmq";
import pino from "pino";
import { loadEnv } from "../config/env.js";
import { createGeocoder } from "../modules/import/geocode.js";
import { createHealthMetricsService } from "../modules/import/health-metrics.service.js";
import { createImportService } from "../modules/import/import.service.js";
import { createRedisConnection } from "./connection.js";
import { IMPORT_QUEUE_NAME, type ImportJobData } from "./import-queue.js";

const WORKER_CONCURRENCY = 2;

async function main() {
  const env = loadEnv();
  const logger = pino({ level: env.NODE_ENV === "test" ? "silent" : "info" });
  const prisma = new PrismaClient();
  const connection = createRedisConnection(env);
  const geocoder = createGeocoder(prisma, env);
  const healthMetrics = createHealthMetricsService(prisma);
  const importService = createImportService({ prisma, geocoder, healthMetrics });

  const worker = new Worker<ImportJobData>(
    IMPORT_QUEUE_NAME,
    async (job) => {
      logger.info({ importJobId: job.data.importJobId }, "processing import job");
      try {
        await importService.processImportJob(job.data.importJobId, job.data.filePath);
      } finally {
        await unlink(job.data.filePath).catch((err) =>
          logger.warn({ err, filePath: job.data.filePath }, "failed to clean up uploaded import file"),
        );
      }
    },
    { connection, concurrency: WORKER_CONCURRENCY },
  );

  worker.on("failed", (job, err) => {
    logger.error({ importJobId: job?.data.importJobId, err }, "import job failed");
  });

  const shutdown = async () => {
    logger.info("shutting down import worker");
    await worker.close();
    await prisma.$disconnect();
    await connection.quit();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  logger.info("import worker started");
}

main();
