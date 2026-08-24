import { unlink } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { Worker } from "bullmq";
import pino from "pino";
import { loadEnv } from "../config/env.js";
import { createGeocoder } from "../modules/import/geocode.js";
import { createHealthMetricsService } from "../modules/import/health-metrics.service.js";
import { createImportService } from "../modules/import/import.service.js";
import { createWeatherService } from "../modules/import/weather.js";
import { createLayer1Service } from "../modules/analysis/layer1.service.js";
import { createRedisConnection } from "./connection.js";
import { IMPORT_QUEUE_NAME, type ImportJobData } from "./import-queue.js";
import { ANALYSIS_QUEUE_NAME, type AnalysisJobData } from "./analysis-queue.js";

const WORKER_CONCURRENCY = 2;

/**
 * One analysis pass at a time. A pass is ordered oldest-first within a user, and running several
 * concurrently would only help across *different* users — which isn't worth the contention until
 * there is more than one active user to spread across.
 */
const ANALYSIS_CONCURRENCY = 1;

async function main() {
  const env = loadEnv();
  const logger = pino({ level: env.NODE_ENV === "test" ? "silent" : "info" });
  const prisma = new PrismaClient();
  const connection = createRedisConnection(env);
  const geocoder = createGeocoder(prisma, env);
  const healthMetrics = createHealthMetricsService(prisma);
  const weather = createWeatherService(prisma);
  const importService = createImportService({ prisma, geocoder, healthMetrics, weather });

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

  // BullMQ workers issue blocking Redis commands, so each needs its own connection rather than
  // sharing the import worker's.
  const analysisConnection = createRedisConnection(env);
  const layer1 = createLayer1Service(prisma, logger);

  const analysisWorker = new Worker<AnalysisJobData>(
    ANALYSIS_QUEUE_NAME,
    async (job) => {
      logger.info({ userId: job.data.userId }, "starting layer 1 analysis pass");
      const result = await layer1.analyseUser(job.data.userId);
      return result;
    },
    { connection: analysisConnection, concurrency: ANALYSIS_CONCURRENCY },
  );

  analysisWorker.on("failed", (job, err) => {
    logger.error({ userId: job?.data.userId, err }, "analysis job failed");
  });

  const shutdown = async () => {
    logger.info("shutting down workers");
    await Promise.all([worker.close(), analysisWorker.close()]);
    await prisma.$disconnect();
    await Promise.all([connection.quit(), analysisConnection.quit()]);
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  logger.info("import and analysis workers started");
}

main();
