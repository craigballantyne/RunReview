import type { ReactElement } from "react";
import type { RouteMetric } from "../../lib/route-gradient.js";

export type RouteStyle = "animated" | RouteMetric;

interface RouteStyleControlProps {
  value: RouteStyle;
  onChange: (style: RouteStyle) => void;
  isAllMetricsOpen: boolean;
  onOpenAllMetrics: () => void;
}

const STYLE_OPTIONS: { style: RouteStyle; label: string; icon: ReactElement }[] = [
  {
    style: "animated",
    label: "Route",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
        <path d="M4 19c3-1 3-5 6-5s3 4 6 4 3-6 4-10" />
        <circle cx="4" cy="19" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="20" cy="8" r="1.4" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    style: "pace",
    label: "Pace",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="13" r="8" />
        <path d="M12 13l4-4" />
        <path d="M9 3h6" />
      </svg>
    ),
  },
  {
    style: "heartRate",
    label: "Heart rate",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.5 8.5c0 5-8.5 10-8.5 10s-8.5-5-8.5-10a4.5 4.5 0 0 1 8.5-2 4.5 4.5 0 0 1 8.5 2Z" />
        <path d="M3.5 12h3l1.5-3 2 5 1.5-3h5" />
      </svg>
    ),
  },
  {
    style: "elevation",
    label: "Elevation",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 19l6-10 4 6 2-3 6 7Z" />
      </svg>
    ),
  },
];

const ALL_METRICS_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 20V4" />
    <path d="M4 20h16" />
    <path d="M7 16l3.5-5 3 3L18 7" />
  </svg>
);

function ControlButton({
  label,
  icon,
  isActive,
  onClick,
}: {
  label: string;
  icon: ReactElement;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <div className="group relative">
      <button
        type="button"
        aria-label={label}
        aria-pressed={isActive}
        onClick={onClick}
        className={`flex h-8 w-8 items-center justify-center rounded-md ${
          isActive ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-100"
        }`}
      >
        <span className="h-5 w-5">{icon}</span>
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-10 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs font-medium text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100"
      >
        {label}
      </span>
    </div>
  );
}

export function RouteStyleControl({ value, onChange, isAllMetricsOpen, onOpenAllMetrics }: RouteStyleControlProps) {
  return (
    <div className="absolute right-3 top-3 z-[1000] flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1 shadow-md">
      {STYLE_OPTIONS.map((option) => (
        <ControlButton
          key={option.style}
          label={option.label}
          icon={option.icon}
          isActive={value === option.style}
          onClick={() => onChange(option.style)}
        />
      ))}
      <div className="mx-0.5 h-5 w-px bg-gray-200" />
      <ControlButton label="All metrics" icon={ALL_METRICS_ICON} isActive={isAllMetricsOpen} onClick={onOpenAllMetrics} />
    </div>
  );
}
