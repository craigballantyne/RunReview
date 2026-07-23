import { describe, expect, it } from "vitest";
import { formatActivityDate } from "./format-date.js";

describe("formatActivityDate", () => {
  it("formats the sample run's start_time_local", () => {
    expect(formatActivityDate("2021-07-04T20:25:53.0")).toBe("4 Jul 2021");
  });
});
