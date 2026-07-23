import { describe, expect, it } from "vitest";
import { isRunningActivityType } from "./activity-type.js";

describe("isRunningActivityType", () => {
  it("accepts an exact match", () => {
    expect(isRunningActivityType("running")).toBe(true);
  });

  it("accepts a running variant as a substring", () => {
    expect(isRunningActivityType("trail_running")).toBe(true);
    expect(isRunningActivityType("treadmill_running")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isRunningActivityType("Running")).toBe(true);
    expect(isRunningActivityType("TRAIL_RUNNING")).toBe(true);
  });

  it("rejects non-running activity types", () => {
    expect(isRunningActivityType("cycling")).toBe(false);
    expect(isRunningActivityType("swimming")).toBe(false);
  });
});
