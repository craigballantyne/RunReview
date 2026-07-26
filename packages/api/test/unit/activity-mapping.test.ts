import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { mapActivityToRunCreateInput } from "../../src/modules/import/import.service.js";
import { validateActivity } from "../../src/modules/import/validation.js";

const fixturesDir = fileURLToPath(new URL("../fixtures", import.meta.url));

describe("mapActivityToRunCreateInput", () => {
  it("maps the sample activity's renamed/dropped fields correctly", async () => {
    const raw = JSON.parse(await readFile(`${fixturesDir}/valid-single-activity.json`, "utf8"));
    const validated = validateActivity(raw.activities[0]);
    expect(validated.valid).toBe(true);
    if (!validated.valid) return;

    const input = mapActivityToRunCreateInput(validated.activity, "user-1", 7070576238n, "Edinburgh, UK", 42);

    // activity_id -> external_activity_id, activity_type_key -> activity_type
    expect(input.externalActivityId).toBe(7070576238n);
    expect(input.activityType).toBe("running");
    expect(input.activityName).toBe("City of Edinburgh - Benchmark Run");
    expect(input.userId).toBe("user-1");
    expect(input.location).toBe("Edinburgh, UK");
    expect(input.weatherId).toBe(42);

    // device_name / fetched_at / updated_at must not appear anywhere on the mapped input
    expect(input).not.toHaveProperty("deviceName");
    expect(input).not.toHaveProperty("fetchedAt");
    expect(input).not.toHaveProperty("updatedAt");

    expect(input.splits.createMany.data).toHaveLength(3);
    expect(input.hrZones.createMany.data).toHaveLength(5);
    expect(input.trackPoints.createMany.data).toHaveLength(124);

    // partial GPS lock preserved through the mapping, not dropped or defaulted to 0
    expect(input.trackPoints.createMany.data[0]?.latitude).toBeNull();
    expect(input.trackPoints.createMany.data[108]?.latitude).toBeCloseTo(55.9534, 3);
  });
});
