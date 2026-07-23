import type { TrackPoint } from "@run-review/shared";

export type RouteMetric = "pace" | "heartRate" | "elevation";

export interface GradientSegment {
  positions: [[number, number], [number, number]];
  color: string;
}

interface MetricConfig {
  getValue: (point: TrackPoint) => number | null;
  /** true when a HIGH raw value should be LIGHT (e.g. pace uses speed, where faster = lighter). */
  invert: boolean;
  light: string;
  dark: string;
}

// Single-hue ramps (one hue per metric so the active mode reads at a glance): pale but still
// colorful at the light end, deep but still colorful at the dark end — enough range to read
// clearly without washing out to near-black/near-white and losing the hue.
const METRIC_CONFIG: Record<RouteMetric, MetricConfig> = {
  pace: { getValue: (p) => p.speedMps, invert: true, light: "#bfdbfe", dark: "#1e3a8a" },
  heartRate: { getValue: (p) => p.heartRate, invert: false, light: "#fecaca", dark: "#7f1d1d" },
  elevation: { getValue: (p) => p.elevationM, invert: true, light: "#bbf7d0", dark: "#14532d" },
};

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  const toHex = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function mixColor(lightHex: string, darkHex: string, t: number): string {
  const light = hexToRgb(lightHex);
  const dark = hexToRgb(darkHex);
  const clamped = Math.min(1, Math.max(0, t));
  return rgbToHex([
    light[0] + (dark[0] - light[0]) * clamped,
    light[1] + (dark[1] - light[1]) * clamped,
    light[2] + (dark[2] - light[2]) * clamped,
  ]);
}

/**
 * Builds one small polyline segment per consecutive pair of valid track points, each colored by
 * where its (averaged) metric value falls between the route's own observed min/max. Points
 * missing a position or the metric value are dropped, leaving a gap rather than a wrong color.
 */
export function buildGradientSegments(trackPoints: TrackPoint[], metric: RouteMetric): GradientSegment[] {
  const config = METRIC_CONFIG[metric];

  const points = trackPoints
    .slice()
    .sort((a, b) => a.pointIndex - b.pointIndex)
    .filter((p) => p.latitude !== null && p.longitude !== null && config.getValue(p) !== null)
    .map((p) => ({ lat: p.latitude as number, lng: p.longitude as number, value: config.getValue(p) as number }));

  if (points.length < 2) return [];

  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;

  const segments: GradientSegment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (!a || !b) continue;
    const t = range === 0 ? 0.5 : ((a.value + b.value) / 2 - min) / range;
    const darkness = config.invert ? 1 - t : t;
    segments.push({
      positions: [
        [a.lat, a.lng],
        [b.lat, b.lng],
      ],
      color: mixColor(config.light, config.dark, darkness),
    });
  }
  return segments;
}
