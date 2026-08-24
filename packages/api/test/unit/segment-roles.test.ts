import { describe, expect, it } from "vitest";
import { classifySegmentRoles, hasWarmupOrCooldown } from "../../src/modules/analysis/segment-roles.js";
import { genericEasyRunLaps, rolling300sLaps, tempoIntervalLaps } from "../fixtures/reference-laps.js";

/** Roles keyed by lap index, for readable assertions against the reference sessions. */
function rolesByIndex(splits: Parameters<typeof classifySegmentRoles>[0], lapMode: "auto" | "structured") {
  return Object.fromEntries(classifySegmentRoles(splits, lapMode).map((s) => [s.splitIndex, s.role]));
}

describe("classifySegmentRoles", () => {
  describe("tempo session with time-boxed recoveries (7 Feb)", () => {
    const roles = rolesByIndex(tempoIntervalLaps, "structured");

    it("identifies the four tempo reps", () => {
      expect(roles[3]).toBe("rep");
      expect(roles[4]).toBe("rep");
      expect(roles[6]).toBe("rep");
      expect(roles[8]).toBe("rep");
    });

    it("identifies the time-boxed recovery jogs between them", () => {
      // 120s, 90s, 90s at variable distance — invisible to any geometry-based rule.
      expect(roles[5]).toBe("recovery");
      expect(roles[7]).toBe("recovery");
      expect(roles[9]).toBe("recovery");
    });

    it("treats the laps before the first rep as warmup", () => {
      expect(roles[1]).toBe("warmup");
      expect(roles[2]).toBe("warmup");
    });

    it("treats the laps after the last rep as cooldown", () => {
      expect(roles[10]).toBe("cooldown");
      expect(roles[11]).toBe("cooldown");
      expect(roles[12]).toBe("cooldown");
    });
  });

  describe("rolling 300s session (13 Feb)", () => {
    const roles = rolesByIndex(rolling300sLaps, "structured");

    it("separates reps from floats of the identical distance", () => {
      // Laps 4 and 5 are both 300m; only pace distinguishes them (4:40/km vs 5:39/km).
      expect(roles[4]).toBe("rep");
      expect(roles[5]).toBe("float");
      expect(roles[6]).toBe("rep");
      expect(roles[7]).toBe("float");
    });

    it("flags the unplanned mid-session stop as recovery, not a float", () => {
      // Lap 8: 94.6m at 11:04/km with HR collapsing to 83.
      expect(roles[8]).toBe("recovery");
    });

    it("treats the opening kilometres as warmup", () => {
      expect(roles[1]).toBe("warmup");
      expect(roles[2]).toBe("warmup");
      expect(roles[3]).toBe("warmup");
    });

    it("treats the closing kilometres as cooldown", () => {
      expect(roles[19]).toBe("cooldown");
      expect(roles[20]).toBe("cooldown");
    });
  });

  describe("generic easy run", () => {
    const segments = classifySegmentRoles(genericEasyRunLaps, "auto");

    it("assigns no reps when there is no programmed structure", () => {
      expect(segments.every((s) => s.role !== "rep")).toBe(true);
    });

    it("does not invent a warmup on a run that has none", () => {
      // Lap 1 is actually faster than the run's median — flagging it as warmup would be wrong.
      expect(hasWarmupOrCooldown(segments)).toBe(false);
    });
  });

  describe("auto-split run with a real warmup and cooldown", () => {
    const laps = [
      { ...genericEasyRunLaps[0]!, splitIndex: 1, durationSec: 430 },
      { ...genericEasyRunLaps[0]!, splitIndex: 2, durationSec: 330 },
      { ...genericEasyRunLaps[0]!, splitIndex: 3, durationSec: 328 },
      { ...genericEasyRunLaps[0]!, splitIndex: 4, durationSec: 332 },
      { ...genericEasyRunLaps[0]!, splitIndex: 5, durationSec: 425 },
    ];
    const roles = rolesByIndex(laps, "auto");

    it("detects slow laps at each end without any rep to anchor on", () => {
      expect(roles[1]).toBe("warmup");
      expect(roles[5]).toBe("cooldown");
      expect(roles[3]).toBe("steady");
    });
  });

  describe("degenerate input", () => {
    it("returns nothing for a run with no splits", () => {
      expect(classifySegmentRoles([], "auto")).toEqual([]);
    });

    it("does not classify reps on an auto-split run even when pace varies", () => {
      // Structure detection owns that decision; role classification must not second-guess it.
      const roles = rolesByIndex(rolling300sLaps, "auto");
      expect(Object.values(roles).every((r) => r !== "rep")).toBe(true);
    });

    it("survives a zero-distance lap without producing NaN roles", () => {
      const withBadLap = [{ ...genericEasyRunLaps[0]!, splitIndex: 1, distanceM: 0, durationSec: 5 }, ...genericEasyRunLaps];
      expect(() => classifySegmentRoles(withBadLap, "auto")).not.toThrow();
    });
  });
});
