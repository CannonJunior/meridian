// Fetches a Google Static Maps image (via the server proxy, see
// server/src/googleStaticMap.ts — the API key lives server-side only) for
// the drawing tool's reference image (DrawingToolManager.tsx,
// TacticalMap.tsx's capture effect). Replaces the old upload-a-screenshot-
// and-place-control-points flow (see git history for imageWarp.ts, removed):
// a Static Maps image's geographic bounds are fully determined by the exact
// (center, zoom, size) parameters it was requested with, using the same
// Web Mercator math every XYZ slippy-map tile scheme uses — so they can be
// computed directly instead of inferred from user-matched landmarks.

// Google's Static Maps API caps the base (unscaled) image at 640x640 for
// standard accounts; scale=2 then returns a sharper 1280x1280 image
// covering that exact same geographic footprint (scale affects only pixel
// density, not the requested extent — see computeStaticMapExtent below,
// which deliberately uses the pre-scale size).
export const GOOGLE_STATIC_MAP_SIZE = 640;
export const GOOGLE_STATIC_MAP_SCALE = 2;
// The full set of scale values the Static Maps API documents — 1 and 2 are
// available on any account; 4 is gated to a Google Maps Platform Premium
// Plan and will fail for most API keys (surfaced as a normal capture error
// if so, same as any other failed request — DrawingToolManager.tsx doesn't
// pre-validate eligibility). Exposed as a resolution control rather than
// hardcoded so an account that *can* use 4x gets the sharper image.
export const GOOGLE_STATIC_MAP_SCALE_OPTIONS = [1, 2, 4] as const;

const EARTH_CIRCUMFERENCE_M = 156543.03392804097; // WGS84 Web Mercator, meters/pixel at zoom 0, equator

// Standard slippy-map resolution formula (meters/pixel at a given zoom and
// latitude), applied to a (center, zoom, size) triple to get the image's
// exact bounds in EPSG:3857 meters — the same scheme Google, OSM, and this
// app's own XYZ basemaps all share.
export function computeStaticMapExtentWebMercator(centerLng: number, centerLat: number, zoom: number, sizePx: number): [number, number, number, number] {
  const metersPerPixel = (EARTH_CIRCUMFERENCE_M * Math.cos((centerLat * Math.PI) / 180)) / Math.pow(2, zoom);
  const halfSpanM = (sizePx / 2) * metersPerPixel;
  // Web Mercator forward projection (lng/lat -> meters) — inlined rather
  // than importing ol/proj here, since this module has no other OpenLayers
  // dependency and the formula is a handful of well-known constants.
  const originShift = 20037508.342789244;
  const cx = (centerLng * originShift) / 180;
  const cy = (Math.log(Math.tan(((90 + centerLat) * Math.PI) / 360)) / (Math.PI / 180)) * (originShift / 180);
  return [cx - halfSpanM, cy - halfSpanM, cx + halfSpanM, cy + halfSpanM];
}

export async function fetchGoogleStaticMapDataUrl(centerLng: number, centerLat: number, zoom: number, scale: number): Promise<string> {
  const url = `/api/google-static-map?lng=${centerLng}&lat=${centerLat}&zoom=${zoom}&size=${GOOGLE_STATIC_MAP_SIZE}&scale=${scale}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Google Static Maps request failed: ${res.status}`);
  }
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read image response.'));
    reader.readAsDataURL(blob);
  });
}
