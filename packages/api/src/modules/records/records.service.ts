import type { PrismaClient } from "@prisma/client";
import { STANDARD_DISTANCES, type DistanceRecord } from "@run-review/shared";

/** How many efforts to keep per distance. */
const TOP_N = 3;

interface RecordRow {
  distance_m: number;
  duration_sec: number;
  run_id: string;
  activity_name: string;
  start_time_local: Date;
}

export function createRecordsService(prisma: PrismaClient) {
  /**
   * The athlete's fastest efforts at each standard distance.
   *
   * A single windowed query rather than one per distance: `ROW_NUMBER` partitioned by distance
   * does the top-N selection in the database, so this stays one round trip however long the
   * distance ladder grows.
   *
   * Ties break on the earlier run, which makes the ordering deterministic — without it, two
   * identical times would swap places between requests.
   */
  async function getRecords(userId: string): Promise<DistanceRecord[]> {
    const rows = await prisma.$queryRaw<RecordRow[]>`
      SELECT t.distance_m, t.duration_sec, t.run_id, r.activity_name, r.start_time_local
      FROM (
        SELECT b.distance_m, b.duration_sec, b.run_id,
               ROW_NUMBER() OVER (
                 PARTITION BY b.distance_m
                 ORDER BY b.duration_sec ASC, b.start_time_gmt ASC
               ) AS rn
        FROM run_best_efforts b
        WHERE b.user_id = ${userId}
      ) t
      JOIN runs r ON r.id = t.run_id
      WHERE t.rn <= ${TOP_N}
      ORDER BY t.distance_m ASC, t.duration_sec ASC
    `;

    const byDistance = new Map<number, RecordRow[]>();
    for (const row of rows) {
      const existing = byDistance.get(row.distance_m);
      if (existing) existing.push(row);
      else byDistance.set(row.distance_m, [row]);
    }

    // Driven by the shared ladder rather than by what the query returned, so distances always
    // appear in their canonical order and carry their label and category. A distance the athlete
    // has never covered is omitted rather than rendered empty.
    return STANDARD_DISTANCES.flatMap((distance) => {
      const entries = byDistance.get(distance.distanceM);
      if (!entries || entries.length === 0) return [];

      return [
        {
          distanceM: distance.distanceM,
          label: distance.label,
          category: distance.category,
          entries: entries.map((row) => ({
            runId: row.run_id,
            activityName: row.activity_name,
            durationSec: row.duration_sec,
            startTimeLocal: row.start_time_local.toISOString(),
          })),
        },
      ];
    });
  }

  return { getRecords };
}

export type RecordsService = ReturnType<typeof createRecordsService>;
