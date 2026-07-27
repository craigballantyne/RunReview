import type { ReactElement } from "react";
import type { RunWeather } from "@run-review/shared";

const CLOUD_PATH = "M7 18h9.5a3.5 3.5 0 0 0 .5-6.96 5 5 0 0 0-9.44-2A4 4 0 0 0 7 18Z";

const CLEAR_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
  </svg>
);

const PARTLY_CLOUDY_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="8" cy="7" r="2.5" />
    <path d="M8 2.5v1.3M4.2 4.2l1 1M3 8h1.3" strokeLinecap="round" />
    <path d="M9 19h7.5a3.5 3.5 0 0 0 .5-6.96 5 5 0 0 0-8-2.6" />
  </svg>
);

const OVERCAST_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d={CLOUD_PATH} />
    <path d="M4 20h2M8 20h2M12 20h2" />
  </svg>
);

const FOG_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 9h9.5a3.5 3.5 0 0 0 .5-6.96A5 5 0 0 0 6.06 4" />
    <path d="M3 13h18M3 17h18M3 21h18" />
  </svg>
);

const RAIN_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d={CLOUD_PATH} />
    <path d="M8 20l-1 2M12 20l-1 2M16 20l-1 2" />
  </svg>
);

const SNOW_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d={CLOUD_PATH} />
    <path d="M8 20v3M6.5 21.5h3M12 20v3M10.5 21.5h3M16 20v3M14.5 21.5h3" />
  </svg>
);

const THUNDERSTORM_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d={CLOUD_PATH} />
    <path d="M13 15l-3 5h3l-2 4" />
  </svg>
);

const WIND_ARROW_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3v16M12 19l-5-5M12 19l5-5" />
  </svg>
);

/**
 * Buckets WMO weather codes (https://open-meteo.com/en/docs, same table used at import time in
 * weather.ts) into 7 icon categories, each with a human-readable label for the hover tooltip.
 * Not an exhaustive per-code mapping — just enough visual distinction to be useful at a glance.
 */
function weatherInfoFor(code: number | null): { icon: ReactElement; label: string } {
  if (code === 0) return { icon: CLEAR_ICON, label: "Clear sky" };
  if (code === 1 || code === 2) return { icon: PARTLY_CLOUDY_ICON, label: "Partly cloudy" };
  if (code === 45 || code === 48) return { icon: FOG_ICON, label: "Fog" };
  if (code === 95 || code === 96 || code === 99) return { icon: THUNDERSTORM_ICON, label: "Thunderstorm" };
  if ((code !== null && code >= 71 && code <= 77) || code === 85 || code === 86) return { icon: SNOW_ICON, label: "Snow" };
  if ((code !== null && code >= 51 && code <= 67) || code === 80 || code === 81 || code === 82) {
    return { icon: RAIN_ICON, label: "Rain" };
  }
  return { icon: OVERCAST_ICON, label: "Overcast" };
}

interface WeatherSummaryProps {
  weather: RunWeather;
}

/**
 * The weather-at-a-glance content (condition icon + tooltip, temperature, wind direction +
 * speed) shared between the floating map overlay (WeatherPanel) and the "All metrics" drawer's
 * summary section — kept as bare content with no positioning/card styling of its own so each
 * caller can lay it out appropriately for its context.
 */
export function WeatherSummary({ weather }: WeatherSummaryProps) {
  const { temperatureC, weatherCode, windSpeedMps, windDirectionDeg } = weather;
  const { icon: weatherIcon, label: weatherLabel } = weatherInfoFor(weatherCode);

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1.5">
        <div className="group relative">
          <span className="block h-7 w-7 text-gray-700">{weatherIcon}</span>
          <span
            role="tooltip"
            className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs font-medium text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100"
          >
            {weatherLabel}
          </span>
        </div>
        {temperatureC !== null && <span className="text-sm font-medium text-gray-900">{Math.round(temperatureC)}°C</span>}
      </div>
      {windSpeedMps !== null && (
        <div className="flex items-center gap-1.5">
          {/* windDirectionDeg is meteorological "from" convention; rotating a down-pointing arrow
              by that value directly makes it visually point in the direction the wind blows
              toward, matching how consumer weather apps (Apple Weather, Windy) draw wind arrows. */}
          <span
            className="h-5 w-5 text-gray-700"
            style={windDirectionDeg !== null ? { transform: `rotate(${windDirectionDeg}deg)` } : undefined}
          >
            {WIND_ARROW_ICON}
          </span>
          <span className="text-sm font-medium text-gray-900">{Math.round(windSpeedMps * 3.6)} km/h</span>
        </div>
      )}
    </div>
  );
}
