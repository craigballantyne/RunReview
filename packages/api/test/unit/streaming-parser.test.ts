import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { peekActivityCount, streamActivities } from "../../src/modules/import/streaming-parser.js";

const fixturesDir = fileURLToPath(new URL("../fixtures", import.meta.url));

describe("peekActivityCount", () => {
  it("reads activity_count from the real sample file", async () => {
    const count = await peekActivityCount(`${fixturesDir}/valid-single-activity.json`);
    expect(count).toBe(1);
  });

  it("reads activity_count from a multi-activity file", async () => {
    const count = await peekActivityCount(`${fixturesDir}/multi-activity.json`);
    expect(count).toBe(4);
  });
});

describe("streamActivities", () => {
  it("streams every activity from the real sample file without loading it as one JSON.parse", async () => {
    const activities: unknown[] = [];
    for await (const activity of streamActivities(`${fixturesDir}/valid-single-activity.json`)) {
      activities.push(activity);
    }
    expect(activities).toHaveLength(1);
    const first = activities[0] as { activity_id: number; track_points: unknown[] };
    expect(first.activity_id).toBe(7070576238);
    expect(first.track_points).toHaveLength(124);
  });

  it("streams all activities in order from a multi-activity file", async () => {
    const activities: { activity_id: number }[] = [];
    for await (const activity of streamActivities(`${fixturesDir}/multi-activity.json`)) {
      activities.push(activity as { activity_id: number });
    }
    expect(activities.map((a) => a.activity_id)).toEqual([1001, 1002, 1003, 1004]);
  });

  it("rejects when the file is not valid JSON, instead of hanging or silently yielding nothing", async () => {
    async function drain() {
      const items: unknown[] = [];
      for await (const activity of streamActivities(`${fixturesDir}/malformed-json.json`)) {
        items.push(activity);
      }
      return items;
    }
    await expect(drain()).rejects.toBeDefined();
  });
});
