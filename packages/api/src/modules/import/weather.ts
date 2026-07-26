import type { PrismaClient } from "@prisma/client";
import PQueue from "p-queue";
import { toDate } from "./time-utils.js";

// ~1.1km, deliberately coarser than geocode.ts's 3-decimal (~110m) rounding — matched to
// ERA5/forecast model grid resolution (~9-25km), so nearby runs share a cache entry more
// aggressively than geocoding does.
const CACHE_PRECISION = 2;

// Open-Meteo publishes no documented hard rate limit for the free tier (unlike Nominatim's ~1
// req/s, which is why geocode.ts throttles to 1.1s) — this is a reasonably polite default that
// won't meaningfully slow down large imports.
const OPEN_METEO_MIN_INTERVAL_MS = 200;

// The historical archive (ERA5 reanalysis) has a ~5 day data lag; this is a safe buffer past it.
const ARCHIVE_LAG_DAYS = 7;

const ARCHIVE_BASE_URL = "https://archive-api.open-meteo.com/v1/archive";
const FORECAST_BASE_URL = "https://api.open-meteo.com/v1/forecast";

const HOURLY_VARIABLES = [
  "temperature_2m",
  "apparent_temperature",
  "relative_humidity_2m",
  "precipitation",
  "weather_code",
  "cloud_cover",
  "wind_speed_10m",
  "wind_direction_10m",
  "wind_gusts_10m",
].join(",");

function round(value: number): number {
  return Math.round(value * 10 ** CACHE_PRECISION) / 10 ** CACHE_PRECISION;
}

function utcDayStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function formatUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * The historical archive (ERA5 reanalysis, 1940-present) can't serve very recent runs because of
 * its data lag — the forecast API covers those instead (near-real-time, far less historical
 * depth). Exported standalone so the date-threshold branch can be unit tested without mocking
 * fetch.
 */
export function selectBaseUrl(dayStart: Date, now: Date = new Date()): string {
  const cutoff = new Date(now.getTime() - ARCHIVE_LAG_DAYS * 24 * 60 * 60 * 1000);
  return dayStart <= cutoff ? ARCHIVE_BASE_URL : FORECAST_BASE_URL;
}

interface OpenMeteoHourlyResponse {
  hourly?: {
    time?: string[];
    temperature_2m?: (number | null)[];
    apparent_temperature?: (number | null)[];
    relative_humidity_2m?: (number | null)[];
    precipitation?: (number | null)[];
    weather_code?: (number | null)[];
    cloud_cover?: (number | null)[];
    wind_speed_10m?: (number | null)[];
    wind_direction_10m?: (number | null)[];
    wind_gusts_10m?: (number | null)[];
  };
}

export interface WeatherService {
  getWeatherId(latitude: number, longitude: number, startTimeGmt: Date): Promise<number | null>;
}

export function createWeatherService(prisma: PrismaClient): WeatherService {
  const queue = new PQueue({ concurrency: 1, interval: OPEN_METEO_MIN_INTERVAL_MS, intervalCap: 1 });

  async function fetchDay(latRounded: number, lonRounded: number, dayStart: Date): Promise<void> {
    const dateStr = formatUtcDate(dayStart);
    const url = new URL(selectBaseUrl(dayStart));
    url.searchParams.set("latitude", String(latRounded));
    url.searchParams.set("longitude", String(lonRounded));
    url.searchParams.set("start_date", dateStr);
    url.searchParams.set("end_date", dateStr);
    url.searchParams.set("hourly", HOURLY_VARIABLES);
    url.searchParams.set("wind_speed_unit", "ms");
    url.searchParams.set("timezone", "UTC");

    const response = await fetch(url);
    if (!response.ok) return;

    const body = (await response.json()) as OpenMeteoHourlyResponse;
    const times = body.hourly?.time;
    if (!times || times.length === 0) return;

    const rows = times.map((time, i) => ({
      latRounded,
      lonRounded,
      timestampUtc: toDate(time),
      temperatureC: body.hourly?.temperature_2m?.[i] ?? null,
      apparentTemperatureC: body.hourly?.apparent_temperature?.[i] ?? null,
      relativeHumidityPct: body.hourly?.relative_humidity_2m?.[i] ?? null,
      precipitationMm: body.hourly?.precipitation?.[i] ?? null,
      weatherCode: body.hourly?.weather_code?.[i] ?? null,
      cloudCoverPct: body.hourly?.cloud_cover?.[i] ?? null,
      windSpeedMps: body.hourly?.wind_speed_10m?.[i] ?? null,
      windDirectionDeg: body.hourly?.wind_direction_10m?.[i] ?? null,
      windGustsMps: body.hourly?.wind_gusts_10m?.[i] ?? null,
    }));

    // skipDuplicates tolerates a racing concurrent import fetching the same location+day.
    // Note: if Open-Meteo ever returns a partial day (e.g. right at the archive lag boundary),
    // that partial set gets cached as "already fetched" permanently — an accepted simplification.
    await prisma.weatherHourly.createMany({ data: rows, skipDuplicates: true });
  }

  function nearestRow<T extends { timestampUtc: Date }>(rows: T[], startTimeGmt: Date): T | null {
    if (rows.length === 0) return null;
    return rows.reduce((closest, row) =>
      Math.abs(row.timestampUtc.getTime() - startTimeGmt.getTime()) <
      Math.abs(closest.timestampUtc.getTime() - startTimeGmt.getTime())
        ? row
        : closest,
    );
  }

  return {
    async getWeatherId(latitude, longitude, startTimeGmt) {
      try {
        const latRounded = round(latitude);
        const lonRounded = round(longitude);
        const dayStart = utcDayStart(startTimeGmt);
        const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
        const dayFilter = { latRounded, lonRounded, timestampUtc: { gte: dayStart, lt: dayEnd } };

        let rows = await prisma.weatherHourly.findMany({ where: dayFilter });

        if (rows.length === 0) {
          await queue.add(() => fetchDay(latRounded, lonRounded, dayStart));
          rows = await prisma.weatherHourly.findMany({ where: dayFilter });
        }

        return nearestRow(rows, startTimeGmt)?.id ?? null;
      } catch {
        // Best-effort, matches the geocoder's philosophy: a weather lookup failure never fails
        // the run insert or the import.
        return null;
      }
    },
  };
}
