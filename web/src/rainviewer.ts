// RainViewer (rainviewer.com) live global weather radar — free, no API key.
// Aggregates 1000+ national radar networks worldwide (incl. Spain's AEMET,
// covering the current Gibraltar AO), unlike NOAA nowCOAST which is
// CONUS-only. Genuinely worldwide coverage, which is why this was picked
// over NOAA — it'll keep working as more AOs are added elsewhere in the
// world. weather-maps.json lists available
// frames; the most recent "past" frame is the current live mosaic. Frames
// advance roughly every 10 minutes, so callers should re-fetch on that
// cadence to keep the tile URL current.
const WEATHER_MAPS_URL = 'https://api.rainviewer.com/public/weather-maps.json';

interface RainviewerFrame {
  time: number;
  path: string;
}

interface RainviewerResponse {
  host: string;
  radar: { past: RainviewerFrame[] };
}

// Color scheme 2 (universal blue), smoothed (1), snow shown distinctly (1).
function tileUrlForFrame(host: string, path: string): string {
  return `${host}${path}/256/{z}/{x}/{y}/2/1_1.png`;
}

export async function fetchLatestRadarTileUrl(): Promise<string> {
  const res = await fetch(WEATHER_MAPS_URL);
  if (!res.ok) throw new Error(`RainViewer weather-maps.json failed: ${res.status}`);
  const data: RainviewerResponse = await res.json();
  const frames = data.radar.past;
  const latest = frames[frames.length - 1];
  return tileUrlForFrame(data.host, latest.path);
}
