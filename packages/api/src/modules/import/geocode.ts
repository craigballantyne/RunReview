import type { PrismaClient } from "@prisma/client";
import PQueue from "p-queue";
import type { Env } from "../../config/env.js";

// Rounds to ~3 decimal places (~110m at the equator) so nearby starts share a cache entry.
const CACHE_PRECISION = 3;
const NOMINATIM_MIN_INTERVAL_MS = 1100; // stays under Nominatim's ~1 req/sec fair-use policy

function round(value: number): number {
  return Math.round(value * 10 ** CACHE_PRECISION) / 10 ** CACHE_PRECISION;
}

export interface Geocoder {
  reverseGeocode(latitude: number, longitude: number): Promise<string | null>;
  /** Street name only (e.g. "Royal Mile"), not locality/country — used by the route planner's
   * "Running from [street]" label. Deliberately not cached in geocode_cache: that table is keyed
   * by rounded lat/lon to a single locality-format string, and reusing it here would risk a
   * street-name lookup returning a stale locality string cached earlier by the import pipeline
   * (or vice versa) for the same rounded coordinate. */
  reverseGeocodeStreet(latitude: number, longitude: number): Promise<string | null>;
}

export function createGeocoder(prisma: PrismaClient, config: Env): Geocoder {
  const queue = new PQueue({ concurrency: 1, interval: NOMINATIM_MIN_INTERVAL_MS, intervalCap: 1 });

  async function fetchFromNominatim(latitude: number, longitude: number): Promise<string | null> {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("lat", String(latitude));
    url.searchParams.set("lon", String(longitude));
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("zoom", "14"); // city/suburb level, not house-number precision

    const response = await fetch(url, {
      headers: { "User-Agent": config.NOMINATIM_USER_AGENT },
    });

    if (!response.ok) {
      return null;
    }

    const body = (await response.json()) as { address?: Record<string, string>; display_name?: string };
    const address = body.address ?? {};
    const locality = address.city ?? address.town ?? address.village ?? address.suburb ?? address.county;
    const country = address.country;

    if (locality && country) return `${locality}, ${country}`;
    if (locality) return locality;
    return body.display_name ?? null;
  }

  async function fetchStreetFromNominatim(latitude: number, longitude: number): Promise<string | null> {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("lat", String(latitude));
    url.searchParams.set("lon", String(longitude));
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("zoom", "17"); // major/minor street level, so address.road is populated

    const response = await fetch(url, {
      headers: { "User-Agent": config.NOMINATIM_USER_AGENT },
    });

    if (!response.ok) {
      return null;
    }

    const body = (await response.json()) as { address?: Record<string, string> };
    const address = body.address ?? {};
    return address.road ?? address.pedestrian ?? address.footway ?? null;
  }

  return {
    async reverseGeocode(latitude: number, longitude: number): Promise<string | null> {
      const latRounded = round(latitude);
      const lonRounded = round(longitude);

      const cached = await prisma.geocodeCache.findUnique({
        where: { latRounded_lonRounded: { latRounded, lonRounded } },
      });
      if (cached) return cached.location;

      try {
        const location = await queue.add(() => fetchFromNominatim(latitude, longitude));
        if (!location) return null;

        await prisma.geocodeCache
          .upsert({
            where: { latRounded_lonRounded: { latRounded, lonRounded } },
            create: { latRounded, lonRounded, location },
            update: {},
          })
          .catch(() => undefined); // a racing concurrent insert on the same cache key is fine to ignore

        return location;
      } catch {
        // Geocoding failure never fails the activity import — location just stays null.
        return null;
      }
    },

    async reverseGeocodeStreet(latitude: number, longitude: number): Promise<string | null> {
      try {
        const street = await queue.add(() => fetchStreetFromNominatim(latitude, longitude));
        return street ?? null;
      } catch {
        return null;
      }
    },
  };
}
