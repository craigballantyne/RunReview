export interface LatLng {
  lat: number;
  lng: number;
}

export const EDINBURGH_FALLBACK: LatLng = { lat: 55.9533, lng: -3.1883 };

const GEOLOCATION_TIMEOUT_MS = 8000;

export function getCurrentPositionOrFallback(): Promise<LatLng> {
  if (!("geolocation" in navigator)) {
    return Promise.resolve(EDINBURGH_FALLBACK);
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      () => resolve(EDINBURGH_FALLBACK),
      { timeout: GEOLOCATION_TIMEOUT_MS },
    );
  });
}
