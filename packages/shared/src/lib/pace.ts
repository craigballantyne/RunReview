const METERS_PER_KM = 1000;

export function metersToKm(distanceM: number): number {
  return distanceM / METERS_PER_KM;
}

export function formatDistanceKm(distanceM: number): string {
  return `${metersToKm(distanceM).toFixed(2)} km`;
}

/** Returns seconds per km, or null when distance is zero/negative (pace is undefined). */
export function calculatePaceSecPerKm(movingDurationSec: number, distanceM: number): number | null {
  const km = metersToKm(distanceM);
  if (km <= 0) return null;
  return movingDurationSec / km;
}

/** Instantaneous pace (sec/km) from a single track point's speed, or null when stationary/unknown. */
export function paceSecPerKmFromSpeed(speedMps: number | null): number | null {
  if (speedMps === null || speedMps <= 0) return null;
  return METERS_PER_KM / speedMps;
}

export function formatMinSec(totalSec: number): string {
  const roundedSec = Math.round(totalSec);
  const minutes = Math.floor(roundedSec / 60);
  const seconds = roundedSec % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** Formats as "m:ss /km", or "–" when pace can't be computed. */
export function formatPace(movingDurationSec: number, distanceM: number): string {
  const paceSecPerKm = calculatePaceSecPerKm(movingDurationSec, distanceM);
  if (paceSecPerKm === null) return "–";
  return `${formatMinSec(paceSecPerKm)} /km`;
}

/** Formats a duration as "h:mm:ss" (omitting the hours segment under an hour). */
export function formatDuration(durationSec: number): string {
  const roundedSec = Math.round(durationSec);
  const hours = Math.floor(roundedSec / 3600);
  const minutes = Math.floor((roundedSec % 3600) / 60);
  const seconds = roundedSec % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
