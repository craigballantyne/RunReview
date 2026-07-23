import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { computeDomain, createLinearScale, findNearestIndex, generateTicks } from "../../../lib/chart-scale.js";

export interface ChartPoint {
  x: number; // elapsed seconds
  y: number | null;
}

interface TrackPointChartProps {
  points: ChartPoint[];
  mark: "bar" | "line" | "area";
  color: string;
  averageValue?: number | null;
  averageLabel?: string;
  xTickFormat: (value: number) => string;
  yTickFormat: (value: number) => string;
  tooltipValueFormat: (value: number) => string;
  /** Flips which end of the Y domain sits at the top — e.g. pace, where a lower value (faster)
   * should read as a bigger bar rather than a shorter one. */
  invertY?: boolean;
  /** Hard ceiling on the Y domain's upper bound — applied after auto-padding, so it's an exact
   * cap (e.g. 15:00/km) rather than a value the 15% padding could still push past. */
  yDomainMax?: number;
}

const WIDTH = 600;
const HEIGHT = 220;
const MARGIN = { top: 12, right: 16, bottom: 28, left: 48 };
const PLOT_WIDTH = WIDTH - MARGIN.left - MARGIN.right;
const PLOT_HEIGHT = HEIGHT - MARGIN.top - MARGIN.bottom;
const MAX_BAR_WIDTH = 24;
const BAR_GAP = 2;
const AXIS_COLOR = "#e1e0d9";
const TEXT_COLOR = "#898781";
const AVERAGE_LINE_COLOR = "#4b5563"; // gray-600 — deliberately darker than the gridlines so the
// dashed average line stays legible over bars/lines of any series color, not just its own hue.
const TICK_FONT_SIZE = 9;

export function TrackPointChart({
  points,
  mark,
  color,
  averageValue,
  averageLabel,
  xTickFormat,
  yTickFormat,
  tooltipValueFormat,
  invertY = false,
  yDomainMax,
}: TrackPointChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const validPoints = points.filter((p): p is { x: number; y: number } => p.y !== null);
  const xDomain: [number, number] = [0, Math.max(1, ...points.map((p) => p.x))];
  const yValues = validPoints.map((p) => p.y);
  const paddedDomain = computeDomain(averageValue != null ? [...yValues, averageValue] : yValues, 0.15);
  const yDomain: [number, number] = [paddedDomain[0], yDomainMax !== undefined ? Math.min(paddedDomain[1], yDomainMax) : paddedDomain[1]];

  const xScale = createLinearScale(xDomain, [0, PLOT_WIDTH]);
  const yScale = createLinearScale(yDomain, invertY ? [0, PLOT_HEIGHT] : [PLOT_HEIGHT, 0]);

  const xTicks = generateTicks(xDomain, 5);
  const yTicks = generateTicks(yDomain, 4);

  function handlePointerMove(event: ReactPointerEvent<SVGRectElement>) {
    const svg = svgRef.current;
    if (!svg || validPoints.length === 0) return;
    const rect = svg.getBoundingClientRect();
    const svgX = ((event.clientX - rect.left) / rect.width) * WIDTH - MARGIN.left;
    const targetElapsed = xDomain[0] + (svgX / PLOT_WIDTH) * (xDomain[1] - xDomain[0]);
    setHoverIndex(findNearestIndex(validPoints, (p) => p.x, targetElapsed));
  }

  const hoverPoint = hoverIndex !== null ? validPoints[hoverIndex] : undefined;

  return (
    <div className="relative w-full">
      <svg ref={svgRef} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-auto w-full" onPointerLeave={() => setHoverIndex(null)}>
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          {/* Gridlines + Y ticks */}
          {yTicks.map((tick) => (
            <g key={tick}>
              <line x1={0} x2={PLOT_WIDTH} y1={yScale(tick)} y2={yScale(tick)} stroke={AXIS_COLOR} strokeWidth={1} />
              <text x={-8} y={yScale(tick)} dy="0.32em" textAnchor="end" fontSize={TICK_FONT_SIZE} fill={TEXT_COLOR}>
                {yTickFormat(tick)}
              </text>
            </g>
          ))}

          {/* X ticks */}
          {xTicks.map((tick) => (
            <text key={tick} x={xScale(tick)} y={PLOT_HEIGHT + 18} textAnchor="middle" fontSize={TICK_FONT_SIZE} fill={TEXT_COLOR}>
              {xTickFormat(tick)}
            </text>
          ))}
          <line x1={0} x2={PLOT_WIDTH} y1={PLOT_HEIGHT} y2={PLOT_HEIGHT} stroke={AXIS_COLOR} strokeWidth={1} />

          {/* Marks */}
          {mark === "bar" &&
            (() => {
              const slot = PLOT_WIDTH / Math.max(1, points.length);
              const barWidth = Math.max(0.5, Math.min(MAX_BAR_WIDTH, slot - BAR_GAP));
              return points.map((p, i) =>
                p.y === null ? null : (
                  <rect
                    key={i}
                    x={xScale(p.x) - barWidth / 2}
                    y={yScale(p.y)}
                    width={barWidth}
                    height={Math.max(0, PLOT_HEIGHT - yScale(p.y))}
                    rx={2}
                    fill={color}
                    opacity={hoverPoint && hoverPoint.x === p.x ? 1 : 0.85}
                  />
                ),
              );
            })()}

          {mark === "line" && <PathMarks points={validPoints} xScale={xScale} yScale={yScale} color={color} fill={false} />}
          {mark === "area" && (
            <PathMarks points={validPoints} xScale={xScale} yScale={yScale} color={color} fill baseline={PLOT_HEIGHT} />
          )}

          {/* Average reference line — rendered after the marks (and in a neutral grey, not the
              series hue) so it stays readable crossing over bars/lines of any color. */}
          {averageValue != null && (
            <g>
              <line
                x1={0}
                x2={PLOT_WIDTH}
                y1={yScale(averageValue)}
                y2={yScale(averageValue)}
                stroke={AVERAGE_LINE_COLOR}
                strokeWidth={1.5}
                strokeDasharray="4 3"
              />
              {averageLabel && (
                <text
                  x={PLOT_WIDTH}
                  y={yScale(averageValue) - 4}
                  textAnchor="end"
                  fontSize={TICK_FONT_SIZE}
                  fill={AVERAGE_LINE_COLOR}
                  fontWeight={600}
                >
                  {averageLabel}
                </text>
              )}
            </g>
          )}

          {/* Hover crosshair (line/area only — bars highlight themselves) */}
          {mark !== "bar" && hoverPoint && (
            <>
              <line x1={xScale(hoverPoint.x)} x2={xScale(hoverPoint.x)} y1={0} y2={PLOT_HEIGHT} stroke={TEXT_COLOR} strokeWidth={1} />
              <circle cx={xScale(hoverPoint.x)} cy={yScale(hoverPoint.y)} r={4} fill={color} stroke="#fff" strokeWidth={2} />
            </>
          )}

          {/* Hover hit area */}
          <rect
            x={0}
            y={0}
            width={PLOT_WIDTH}
            height={PLOT_HEIGHT}
            fill="transparent"
            onPointerMove={handlePointerMove}
            onPointerLeave={() => setHoverIndex(null)}
          />
        </g>
      </svg>
      {hoverPoint && (
        <div
          className="pointer-events-none absolute rounded bg-gray-900 px-2 py-1 text-xs text-white shadow-lg"
          style={{
            left: `${(MARGIN.left + xScale(hoverPoint.x)) / WIDTH * 100}%`,
            top: `${(MARGIN.top + yScale(hoverPoint.y)) / HEIGHT * 100}%`,
            transform: "translate(-50%, -130%)",
          }}
        >
          <div className="font-semibold">{tooltipValueFormat(hoverPoint.y)}</div>
          <div className="text-gray-300">{xTickFormat(hoverPoint.x)}</div>
        </div>
      )}
    </div>
  );
}

function PathMarks({
  points,
  xScale,
  yScale,
  color,
  fill,
  baseline,
}: {
  points: { x: number; y: number }[];
  xScale: (v: number) => number;
  yScale: (v: number) => number;
  color: string;
  fill: boolean;
  baseline?: number;
}) {
  if (points.length === 0) return null;

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${xScale(p.x)} ${yScale(p.y)}`).join(" ");

  return (
    <>
      {fill && baseline !== undefined && (
        <path
          d={`${linePath} L ${xScale(points[points.length - 1]!.x)} ${baseline} L ${xScale(points[0]!.x)} ${baseline} Z`}
          fill={color}
          opacity={0.1}
          stroke="none"
        />
      )}
      <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </>
  );
}
