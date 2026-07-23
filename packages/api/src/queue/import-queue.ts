import { Queue } from "bullmq";
import type { Redis } from "ioredis";

export const IMPORT_QUEUE_NAME = "import-activities";

export interface ImportJobData {
  importJobId: string;
  filePath: string;
}

export function createImportQueue(connection: Redis): Queue<ImportJobData> {
  return new Queue<ImportJobData>(IMPORT_QUEUE_NAME, { connection });
}
