import { z } from "zod";

const trackPointSchema = z.object({
  point_index: z.number().int(),
  elapsed_sec: z.number(),
  latitude: z.number().nullable().optional().default(null),
  longitude: z.number().nullable().optional().default(null),
  elevation_m: z.number().nullable().optional().default(null),
  heart_rate: z.number().int().nullable().optional().default(null),
  speed_mps: z.number().nullable().optional().default(null),
});

const splitSchema = z.object({
  split_index: z.number().int(),
  start_time_gmt: z.string(),
  distance_m: z.number(),
  duration_sec: z.number(),
  avg_speed_mps: z.number().nullable().optional().default(null),
  avg_hr: z.number().int().nullable().optional().default(null),
  max_hr: z.number().int().nullable().optional().default(null),
  avg_cadence_spm: z.number().nullable().optional().default(null),
  elevation_gain_m: z.number().nullable().optional().default(null),
  elevation_loss_m: z.number().nullable().optional().default(null),
});

const hrZoneSchema = z.object({
  zone_number: z.number().int(),
  zone_low_bpm: z.number().int().nullable().optional().default(null),
  zone_high_bpm: z.number().int().nullable().optional().default(null),
  seconds_in_zone: z.number(),
});

// Unlike the activity's own start_time_gmt/start_time_local (ISO strings), sleep's timestamps
// are epoch-ms numbers.
const sleepSchema = z.object({
  sleep_time_sec: z.number().int().nullable().optional().default(null),
  nap_time_sec: z.number().int().nullable().optional().default(null),
  deep_sleep_sec: z.number().int().nullable().optional().default(null),
  light_sleep_sec: z.number().int().nullable().optional().default(null),
  rem_sleep_sec: z.number().int().nullable().optional().default(null),
  awake_sleep_sec: z.number().int().nullable().optional().default(null),
  sleep_start_gmt: z.number(),
  sleep_end_gmt: z.number(),
  sleep_start_local: z.number(),
  sleep_end_local: z.number(),
  sleep_score: z.number().int().nullable().optional().default(null),
  sleep_score_qualifier: z.string().nullable().optional().default(null),
});

// Readings use epoch-ms timestamps (like sleep), while the parent window uses ISO strings
// (like the activity's own start_time_gmt/start_time_local) — an intentional asymmetry in the
// source data, not a typo.
interface BodyBatteryReading {
  reading_index: number;
  timestamp_gmt: number;
  battery_level: number;
}

// Real exports occasionally have individual readings with a null field (e.g. a momentary gap in
// battery_level) or a null entry outright. A single bad reading shouldn't fail the whole
// activity — parse permissively, then drop only the malformed entries, keeping the rest of the
// readings and the base body_battery values (charged/drained/window) intact.
const looseBodyBatteryReadingSchema = z
  .object({
    reading_index: z.number().int().nullable(),
    timestamp_gmt: z.number().nullable(),
    battery_level: z.number().int().nullable(),
  })
  .nullable();

const bodyBatterySchema = z.object({
  charged: z.number().int().nullable().optional().default(null),
  drained: z.number().int().nullable().optional().default(null),
  start_timestamp_gmt: z.string(),
  end_timestamp_gmt: z.string(),
  start_timestamp_local: z.string(),
  end_timestamp_local: z.string(),
  readings: z
    .array(looseBodyBatteryReadingSchema)
    .optional()
    .default([])
    .transform((readings) =>
      readings.filter(
        (r): r is BodyBatteryReading =>
          r !== null && r.reading_index !== null && r.timestamp_gmt !== null && r.battery_level !== null,
      ),
    ),
});

export const activitySchema = z
  .object({
    activity_id: z.union([z.number(), z.string()]),
    activity_name: z.string(),
    activity_type_key: z.string(),
    start_time_gmt: z.string(),
    start_time_local: z.string(),
    duration_sec: z.number(),
    moving_duration_sec: z.number(),
    distance_m: z.number(),
    avg_speed_mps: z.number().nullable().optional().default(null),
    max_speed_mps: z.number().nullable().optional().default(null),
    avg_hr: z.number().int().nullable().optional().default(null),
    max_hr: z.number().int().nullable().optional().default(null),
    avg_cadence_spm: z.number().nullable().optional().default(null),
    max_cadence_spm: z.number().nullable().optional().default(null),
    elevation_gain_m: z.number().nullable().optional().default(null),
    elevation_loss_m: z.number().nullable().optional().default(null),
    calories: z.number().nullable().optional().default(null),
    start_latitude: z.number().nullable().optional().default(null),
    start_longitude: z.number().nullable().optional().default(null),
    splits: z.array(splitSchema).optional().default([]),
    hr_zones: z.array(hrZoneSchema).optional().default([]),
    track_points: z.array(trackPointSchema).optional().default([]),
    sleep: sleepSchema.nullable().optional().default(null),
    body_battery: bodyBatterySchema.nullable().optional().default(null),
  })
  .passthrough(); // device_name / fetched_at / updated_at / unknown fields are ignored, not errors

export type ValidatedActivity = z.infer<typeof activitySchema>;

export type ActivityValidationResult =
  | { valid: true; activity: ValidatedActivity }
  | { valid: false; reason: string; activityName: string | null; externalActivityId: string | number | null };

function extractIdentityForErrorReporting(raw: unknown): { activityName: string | null; externalActivityId: string | number | null } {
  if (typeof raw !== "object" || raw === null) {
    return { activityName: null, externalActivityId: null };
  }
  const record = raw as Record<string, unknown>;
  const activityName = typeof record.activity_name === "string" ? record.activity_name : null;
  const externalActivityId =
    typeof record.activity_id === "number" || typeof record.activity_id === "string" ? record.activity_id : null;
  return { activityName, externalActivityId };
}

export function validateActivity(raw: unknown): ActivityValidationResult {
  const result = activitySchema.safeParse(raw);
  if (result.success) {
    return { valid: true, activity: result.data };
  }

  const { activityName, externalActivityId } = extractIdentityForErrorReporting(raw);
  const firstIssue = result.error.issues[0];
  const reason = firstIssue ? `${firstIssue.path.join(".") || "activity"}: ${firstIssue.message}` : "Invalid activity";
  return { valid: false, reason, activityName, externalActivityId };
}
