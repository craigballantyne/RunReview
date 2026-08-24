import type { HeatStress, TempBucket, WeatherFlags } from "@run-review/shared";

/**
 * Thresholds below encode a cool, damp baseline (median 9.6°C and 82% humidity across the
 * reference history). Re-derive them if the athlete's climate changes — a flag that fires on most
 * runs carries no information, which is exactly what an ungated humidity threshold did here.
 */
const TEMP_COLD_CEILING_C = 5;
const TEMP_COOL_CEILING_C = 12;
const TEMP_MILD_CEILING_C = 18;
const TEMP_WARM_CEILING_C = 24;

/**
 * Humidity is only flagged alongside warmth. High humidity impairs running by blocking
 * evaporative cooling, which is not a constraint at 8°C — and with a median humidity of 82%, a
 * bare `> 80%` test fires on 54% of runs while the temperature-gated pair fires on 4%.
 */
const HUMIDITY_MIN_TEMP_C = 15;
const HUMIDITY_THRESHOLD_PCT = 80;

/** 20 km/h, expressed in the m/s the column actually stores. */
const WIND_THRESHOLD_MPS = 5.56;

/** Apparent ("feels like") temperature already folds in humidity and wind. */
const HEAT_MODERATE_FLOOR_C = 18;
const HEAT_HIGH_FLOOR_C = 24;

export interface WeatherInput {
  temperatureC: number | null;
  apparentTemperatureC: number | null;
  relativeHumidityPct: number | null;
  windSpeedMps: number | null;
}

function classifyTempBucket(temperatureC: number | null): TempBucket | null {
  if (temperatureC === null) return null;
  if (temperatureC < TEMP_COLD_CEILING_C) return "cold";
  if (temperatureC < TEMP_COOL_CEILING_C) return "cool";
  if (temperatureC < TEMP_MILD_CEILING_C) return "mild";
  if (temperatureC < TEMP_WARM_CEILING_C) return "warm";
  return "hot";
}

/**
 * Derived from apparent temperature rather than a hand-rolled heat index. The weather import
 * already stores `apparentTemperatureC`, which combines temperature, humidity and wind into the
 * single figure a physiological heat-stress estimate would otherwise have to reconstruct.
 */
function classifyHeatStress(apparentTemperatureC: number | null): HeatStress | null {
  if (apparentTemperatureC === null) return null;
  if (apparentTemperatureC < HEAT_MODERATE_FLOOR_C) return "low";
  if (apparentTemperatureC < HEAT_HIGH_FLOOR_C) return "moderate";
  return "high";
}

export function computeWeatherFlags(weather: WeatherInput | null): WeatherFlags {
  if (weather === null) {
    return { tempBucket: null, humidityFlag: false, windFlag: false, heatStress: null };
  }

  const humidityFlag =
    weather.temperatureC !== null &&
    weather.relativeHumidityPct !== null &&
    weather.temperatureC >= HUMIDITY_MIN_TEMP_C &&
    weather.relativeHumidityPct > HUMIDITY_THRESHOLD_PCT;

  return {
    tempBucket: classifyTempBucket(weather.temperatureC),
    humidityFlag,
    windFlag: weather.windSpeedMps !== null && weather.windSpeedMps > WIND_THRESHOLD_MPS,
    heatStress: classifyHeatStress(weather.apparentTemperatureC),
  };
}
