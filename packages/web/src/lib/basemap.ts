/**
 * Shared basemap configuration for every Leaflet map in the app.
 *
 * Stadia's "Alidade Smooth" replaces CARTO Positron, which stopped serving anonymously — it began
 * returning an "API KEY REQUIRED" placeholder image under a **200** response, so nothing failed
 * loudly and the maps simply went blank-ish. Alidade Smooth is the closest equivalent: the same
 * pale, low-contrast style, which is what keeps the pace/HR gradient routes and markers readable
 * on top of it.
 *
 * ⚠️ Keyless access works from localhost only. Stadia authorises requests by referer, so a deployed
 * build on any real domain needs a free API key registered to that domain, appended as
 * `?api_key=...`. There is no deployment today, which is the only reason this is a bare constant
 * rather than an environment variable.
 *
 * Tiles are 256×256, so no `tileSize`/`zoomOffset` override is needed — note that Stadia's *error*
 * placeholder is 512×512, which is misleading if you probe the endpoint without a valid referer.
 */
export const BASEMAP_TILE_URL = "https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png";

export const BASEMAP_ATTRIBUTION =
  '&copy; <a href="https://www.stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
