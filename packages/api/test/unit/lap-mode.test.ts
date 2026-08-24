import { describe, expect, it } from "vitest";
import { detectLapMode } from "../../src/modules/analysis/lap-mode.js";
import {
  allKilometreRepsLaps,
  genericEasyRunLaps,
  hillyContinuousLaps,
  interruptedEasyRunLaps,
  rolling300sLaps,
  tempoIntervalLaps,
} from "../fixtures/reference-laps.js";

describe("detectLapMode", () => {
  describe("stage 1 — lap length", () => {
    it("classifies a generic run of 1km auto-splits as auto", () => {
      expect(detectLapMode(genericEasyRunLaps)).toEqual({ lapMode: "auto", lapModeSource: null });
    });

    it("classifies a programmed session with variable-length recoveries as structured", () => {
      expect(detectLapMode(tempoIntervalLaps)).toEqual({ lapMode: "structured", lapModeSource: "lap_length" });
    });

    it("classifies a rep session of short equal-length laps as structured", () => {
      expect(detectLapMode(rolling300sLaps)).toEqual({ lapMode: "structured", lapModeSource: "lap_length" });
    });

    it("ignores the trailing remainder lap, which every run has", () => {
      // Without dropping the last lap, the generic run's 67.3m remainder would make every single
      // run look structured.
      const withoutRemainder = genericEasyRunLaps.slice(0, -1);
      expect(detectLapMode(withoutRemainder).lapMode).toBe("auto");
    });

    it("does not depend on lap ordering in the input", () => {
      const shuffled = [...tempoIntervalLaps].reverse();
      expect(detectLapMode(shuffled)).toEqual({ lapMode: "structured", lapModeSource: "lap_length" });
    });
  });

  describe("stage 2 — pace alternation", () => {
    it("catches a session programmed entirely in 1km reps", () => {
      expect(detectLapMode(allKilometreRepsLaps)).toEqual({
        lapMode: "structured",
        lapModeSource: "pace_alternation",
      });
    });

    it("does not trip on the reference easy run, whose largest swing is 8.3%", () => {
      expect(detectLapMode(genericEasyRunLaps).lapModeSource).toBeNull();
    });

    it("does not trip on a hilly continuous run, where the swing tracks elevation", () => {
      expect(detectLapMode(hillyContinuousLaps)).toEqual({ lapMode: "auto", lapModeSource: null });
    });

    it("does not trip on an interrupted easy run whose HR never cycles", () => {
      // Regression: this real run cleared the pace gates and had no elevation data to reject it on.
      // Its slow laps sit at HR 158-159 against 166 on the fast laps — 8.5 bpm of separation, where
      // a genuine 1km rep session shows around 34.
      expect(detectLapMode(interruptedEasyRunLaps)).toEqual({ lapMode: "auto", lapModeSource: null });
    });

    it("declines to infer reps when HR data is missing entirely", () => {
      const noHeartRate = allKilometreRepsLaps.map((l) => ({ ...l, avgHr: null }));
      expect(detectLapMode(noHeartRate).lapMode).toBe("auto");
    });

    it("does not trip on a progression run, which drifts rather than alternating", () => {
      const progression = [1, 2, 3, 4, 5, 6, 7].map((i) => ({
        ...genericEasyRunLaps[0]!,
        splitIndex: i,
        distanceM: 1000,
        // Monotonic 30s/km speed-up across the run: large total change, no alternation.
        durationSec: 420 - i * 30,
      }));
      expect(detectLapMode([...progression, { ...genericEasyRunLaps[10]! }]).lapMode).toBe("auto");
    });

    it("needs at least four non-remainder laps before inferring from pace", () => {
      const tooShort = allKilometreRepsLaps.slice(0, 3);
      expect(detectLapMode(tooShort).lapMode).toBe("auto");
    });
  });

  describe("degenerate input", () => {
    it("treats a run with no splits as auto", () => {
      expect(detectLapMode([])).toEqual({ lapMode: "auto", lapModeSource: null });
    });

    it("treats a run with only a remainder lap as auto", () => {
      expect(detectLapMode([genericEasyRunLaps[10]!])).toEqual({ lapMode: "auto", lapModeSource: null });
    });
  });
});
