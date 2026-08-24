import { describe, expect, it } from "vitest";
import { classifyRunTypeByDistance } from "../../src/modules/analysis/run-type.js";

/** Twelve runs around 10km — enough history to trigger relative classification. */
const tenKmHistory = [9500, 10000, 10200, 9800, 10100, 9900, 10300, 9700, 10000, 10400, 9600, 10000];

describe("classifyRunTypeByDistance", () => {
  describe("with enough history", () => {
    it("classifies at or above 1.5x the rolling median as long", () => {
      expect(classifyRunTypeByDistance(15000, tenKmHistory)).toBe("long");
      expect(classifyRunTypeByDistance(21000, tenKmHistory)).toBe("long");
    });

    it("classifies at or below 0.75x the rolling median as short", () => {
      expect(classifyRunTypeByDistance(7500, tenKmHistory)).toBe("short");
      expect(classifyRunTypeByDistance(5000, tenKmHistory)).toBe("short");
    });

    it("leaves ordinary week-to-week variation as medium", () => {
      expect(classifyRunTypeByDistance(10000, tenKmHistory)).toBe("medium");
      expect(classifyRunTypeByDistance(12000, tenKmHistory)).toBe("medium");
      expect(classifyRunTypeByDistance(8500, tenKmHistory)).toBe("medium");
    });

    it("is relative to the athlete, not to absolute distance", () => {
      // 12km is long for someone whose median is 7km and short for someone whose median is 18km.
      const shortRunner = Array(12).fill(7000);
      const longRunner = Array(12).fill(18000);

      expect(classifyRunTypeByDistance(12000, shortRunner)).toBe("long");
      expect(classifyRunTypeByDistance(12000, longRunner)).toBe("short");
    });

    it("uses the median rather than the mean, so one outlier does not move it", () => {
      // A single marathon among eleven 10k runs would drag a mean well past 12km.
      const withOutlier = [...Array(11).fill(10000), 42195];
      expect(classifyRunTypeByDistance(15000, withOutlier)).toBe("long");
    });
  });

  describe("cold start", () => {
    it("falls back to absolutes below ten prior runs", () => {
      const thin = [10000, 10000, 10000];

      // Relative would call 15km long against a 10km median; the absolute rule does not.
      expect(classifyRunTypeByDistance(15000, thin)).toBe("medium");
      expect(classifyRunTypeByDistance(16000, thin)).toBe("long");
      expect(classifyRunTypeByDistance(4000, thin)).toBe("short");
    });

    it("handles a first-ever run", () => {
      expect(classifyRunTypeByDistance(8000, [])).toBe("medium");
      expect(classifyRunTypeByDistance(20000, [])).toBe("long");
    });

    it("switches to relative once the tenth prior run exists", () => {
      const nine = Array(9).fill(10000);
      const ten = Array(10).fill(10000);

      expect(classifyRunTypeByDistance(15000, nine)).toBe("medium"); // absolute: not over 15km
      expect(classifyRunTypeByDistance(15000, ten)).toBe("long"); // relative: 1.5x the median
    });
  });

  describe("degenerate history", () => {
    it("ignores zero-distance runs when counting history", () => {
      const padded = [...Array(9).fill(10000), 0, 0, 0];
      // Only nine usable runs, so this stays on the absolute rule.
      expect(classifyRunTypeByDistance(15000, padded)).toBe("medium");
    });
  });
});
