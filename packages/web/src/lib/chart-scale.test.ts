import { describe, expect, it } from "vitest";
import { computeDomain, createLinearScale, findNearestIndex, generateTicks } from "./chart-scale.js";

describe("createLinearScale", () => {
  it("maps domain to range linearly", () => {
    const scale = createLinearScale([0, 10], [0, 100]);
    expect(scale(0)).toBe(0);
    expect(scale(5)).toBe(50);
    expect(scale(10)).toBe(100);
  });

  it("handles an inverted range (e.g. Y axis, larger value = smaller pixel)", () => {
    const scale = createLinearScale([0, 10], [100, 0]);
    expect(scale(0)).toBe(100);
    expect(scale(10)).toBe(0);
  });

  it("returns the range midpoint when the domain has zero span", () => {
    const scale = createLinearScale([5, 5], [0, 100]);
    expect(scale(5)).toBe(50);
  });
});

describe("computeDomain", () => {
  it("pads min/max by the given fraction", () => {
    const [min, max] = computeDomain([0, 10], 0.1);
    expect(min).toBeCloseTo(-1);
    expect(max).toBeCloseTo(11);
  });

  it("returns a default domain for an empty list", () => {
    expect(computeDomain([])).toEqual([0, 1]);
  });

  it("widens a zero-span domain so it isn't degenerate", () => {
    const [min, max] = computeDomain([5, 5]);
    expect(min).toBeLessThan(5);
    expect(max).toBeGreaterThan(5);
  });
});

describe("generateTicks", () => {
  it("generates evenly spaced ticks including both ends", () => {
    expect(generateTicks([0, 100], 5)).toEqual([0, 25, 50, 75, 100]);
  });

  it("returns just the domain start for count <= 1", () => {
    expect(generateTicks([0, 100], 1)).toEqual([0]);
  });
});

describe("findNearestIndex", () => {
  const items = [{ x: 0 }, { x: 10 }, { x: 25 }, { x: 40 }];

  it("finds the closest item by x", () => {
    expect(findNearestIndex(items, (i) => i.x, 24)).toBe(2);
    expect(findNearestIndex(items, (i) => i.x, 4)).toBe(0);
    expect(findNearestIndex(items, (i) => i.x, 100)).toBe(3);
  });

  it("returns 0 for an empty list without throwing", () => {
    expect(findNearestIndex([], (i: { x: number }) => i.x, 5)).toBe(0);
  });
});
