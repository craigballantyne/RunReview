import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { validateActivity } from "../../src/modules/import/validation.js";

const fixturesDir = fileURLToPath(new URL("../fixtures", import.meta.url));

describe("validateActivity", () => {
  it("accepts the real sample activity export", async () => {
    const raw = JSON.parse(await readFile(`${fixturesDir}/valid-single-activity.json`, "utf8"));
    const result = validateActivity(raw.activities[0]);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.activity.activity_id).toBe(7070576238);
      expect(result.activity.splits).toHaveLength(3);
      expect(result.activity.hr_zones).toHaveLength(5);
      expect(result.activity.track_points).toHaveLength(124);
      // hr_zones[3] has zone_high_bpm: null in the sample data (unbounded top zone)
      expect(result.activity.hr_zones[4]?.zone_high_bpm).toBeNull();
      // early track points have null lat/long (pre-GPS-lock)
      expect(result.activity.track_points[0]?.latitude).toBeNull();
      expect(result.activity.track_points[108]?.latitude).not.toBeNull();
    }
  });

  it("rejects an activity missing a required field, reporting the field and an identity for the skip report", () => {
    const result = validateActivity({
      activity_id: 42,
      activity_name: "Broken run",
      activity_type_key: "running",
      start_time_gmt: "2022-01-01T00:00:00.0",
      start_time_local: "2022-01-01T00:00:00.0",
      duration_sec: 100,
      moving_duration_sec: 90,
      // distance_m intentionally missing
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.activityName).toBe("Broken run");
      expect(result.externalActivityId).toBe(42);
      expect(result.reason).toContain("distance_m");
    }
  });

  it("rejects an activity with the wrong field type", () => {
    const result = validateActivity({
      activity_id: 1,
      activity_name: "Bad type",
      activity_type_key: "running",
      start_time_gmt: "2022-01-01T00:00:00.0",
      start_time_local: "2022-01-01T00:00:00.0",
      duration_sec: 100,
      moving_duration_sec: 90,
      distance_m: "not-a-number",
    });
    expect(result.valid).toBe(false);
  });

  it("ignores unknown/dropped fields (device_name, fetched_at, updated_at) without failing", () => {
    const result = validateActivity({
      activity_id: 1,
      activity_name: "Fine",
      activity_type_key: "running",
      start_time_gmt: "2022-01-01T00:00:00.0",
      start_time_local: "2022-01-01T00:00:00.0",
      duration_sec: 100,
      moving_duration_sec: 90,
      distance_m: 1000,
      device_name: "Some Watch",
      fetched_at: "2022-01-01T00:00:00.0",
      updated_at: "2022-01-01T00:00:00.0",
    });
    expect(result.valid).toBe(true);
  });

  it("rejects a completely malformed payload (not an object)", () => {
    const result = validateActivity("not an object");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.activityName).toBeNull();
      expect(result.externalActivityId).toBeNull();
    }
  });

  const baseActivity = {
    activity_id: 1,
    activity_name: "Health metrics",
    activity_type_key: "running",
    start_time_gmt: "2022-01-01T00:00:00.0",
    start_time_local: "2022-01-01T00:00:00.0",
    duration_sec: 100,
    moving_duration_sec: 90,
    distance_m: 1000,
  };

  it("accepts an activity with sleep and body_battery present, parsing their distinct timestamp formats", () => {
    const result = validateActivity({
      ...baseActivity,
      sleep: {
        sleep_time_sec: 27840,
        nap_time_sec: 0,
        deep_sleep_sec: 3840,
        light_sleep_sec: 18360,
        rem_sleep_sec: 5640,
        awake_sleep_sec: 420,
        sleep_start_gmt: 1784611260000,
        sleep_end_gmt: 1784639520000,
        sleep_start_local: 1784614860000,
        sleep_end_local: 1784643120000,
        sleep_score: 89,
        sleep_score_qualifier: "GOOD",
      },
      body_battery: {
        charged: 67,
        drained: 67,
        start_timestamp_gmt: "2026-07-20T23:00:00.0",
        end_timestamp_gmt: "2026-07-21T23:00:00.0",
        start_timestamp_local: "2026-07-21T00:00:00.0",
        end_timestamp_local: "2026-07-22T00:00:00.0",
        readings: [{ reading_index: 0, timestamp_gmt: 1784610900000, battery_level: 33 }],
      },
    });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.activity.sleep?.sleep_score).toBe(89);
      expect(result.activity.body_battery?.readings).toHaveLength(1);
      expect(result.activity.body_battery?.readings[0]?.battery_level).toBe(33);
    }
  });

  it("accepts an activity with sleep and body_battery absent, defaulting both to null", () => {
    const result = validateActivity(baseActivity);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.activity.sleep).toBeNull();
      expect(result.activity.body_battery).toBeNull();
    }
  });

  it("rejects an activity with a malformed sleep block", () => {
    const result = validateActivity({
      ...baseActivity,
      sleep: { sleep_start_gmt: "not-a-number" },
    });
    expect(result.valid).toBe(false);
  });
});
