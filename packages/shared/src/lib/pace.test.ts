import { describe, expect, it } from "vitest";
import {
  calculatePaceSecPerKm,
  formatDistanceKm,
  formatDuration,
  formatPace,
  metersToKm,
  paceSecPerKmFromSpeed,
} from "./pace.js";

describe("metersToKm", () => {
  it("converts meters to km", () => {
    expect(metersToKm(1508.48)).toBeCloseTo(1.50848, 5);
  });
});

describe("formatDistanceKm", () => {
  it("formats to 2 decimal places with unit", () => {
    expect(formatDistanceKm(1508.48)).toBe("1.51 km");
  });
});

describe("calculatePaceSecPerKm", () => {
  it("computes seconds per km from the sample run (540s / 1.50848km)", () => {
    expect(calculatePaceSecPerKm(540, 1508.48)).toBeCloseTo(357.976, 2);
  });

  it("returns null when distance is zero", () => {
    expect(calculatePaceSecPerKm(300, 0)).toBeNull();
  });

  it("returns null when distance is negative", () => {
    expect(calculatePaceSecPerKm(300, -10)).toBeNull();
  });
});

describe("formatPace", () => {
  it("formats as m:ss /km", () => {
    expect(formatPace(540, 1508.48)).toBe("5:58 /km");
  });

  it("formats an even pace correctly", () => {
    expect(formatPace(300, 1000)).toBe("5:00 /km");
  });

  it("returns a placeholder when pace is undefined", () => {
    expect(formatPace(300, 0)).toBe("–");
  });
});

describe("paceSecPerKmFromSpeed", () => {
  it("converts speed to pace (5 m/s -> 200 sec/km)", () => {
    expect(paceSecPerKmFromSpeed(5)).toBeCloseTo(200, 5);
  });

  it("returns null when stationary", () => {
    expect(paceSecPerKmFromSpeed(0)).toBeNull();
  });

  it("returns null for negative speed", () => {
    expect(paceSecPerKmFromSpeed(-1)).toBeNull();
  });

  it("returns null when speed is null", () => {
    expect(paceSecPerKmFromSpeed(null)).toBeNull();
  });
});

describe("formatDuration", () => {
  it("formats under an hour as m:ss", () => {
    expect(formatDuration(540)).toBe("9:00");
  });

  it("formats an hour or more as h:mm:ss", () => {
    expect(formatDuration(3725)).toBe("1:02:05");
  });

  it("rounds fractional seconds", () => {
    expect(formatDuration(59.6)).toBe("1:00");
  });
});
