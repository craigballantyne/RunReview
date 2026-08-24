import { Queue } from "bullmq";
import type { Redis } from "ioredis";

export const ANALYSIS_QUEUE_NAME = "analyse-runs";

export interface AnalysisJobData {
  userId: string;
}

export function createAnalysisQueue(connection: Redis): Queue<AnalysisJobData> {
  return new Queue<AnalysisJobData>(ANALYSIS_QUEUE_NAME, { connection });
}

/**
 * One in-flight analysis pass per user. A pass walks that user's whole backlog oldest-first, so a
 * second concurrent pass would race the first over the same rows — and because the pass is
 * self-healing (it re-reads what still needs work on every run), coalescing duplicate triggers into
 * one job loses nothing.
 */
export function analysisJobIdFor(userId: string): string {
  return `analyse-user-${userId}`;
}
