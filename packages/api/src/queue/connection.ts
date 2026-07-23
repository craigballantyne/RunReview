import { Redis } from "ioredis";
import type { Env } from "../config/env.js";

export function createRedisConnection(env: Env): Redis {
  // BullMQ requires this for its blocking commands.
  return new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
}
