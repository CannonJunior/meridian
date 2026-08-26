// Server-side proxy for the Google Static Maps API — kept server-side so
// the API key (read from the GOOGLE_MAPS_API_KEY environment variable,
// never checked into this repo or sent to the browser) never appears in a
// client-visible request URL. See web/src/googleStaticMap.ts for the
// client half and the drawing tool's use of this (DrawingToolManager.tsx,
// TacticalMap.tsx).
export interface StaticMapParams {
  lng: number;
  lat: number;
  zoom: number;
  size: number;
  scale: number;
}

export async function fetchGoogleStaticMap(params: StaticMapParams): Promise<{ buffer: Buffer; contentType: string }> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_MAPS_API_KEY is not set on the server.');

  const url = new URL('https://maps.googleapis.com/maps/api/staticmap');
  url.searchParams.set('center', `${params.lat},${params.lng}`);
  url.searchParams.set('zoom', String(params.zoom));
  url.searchParams.set('size', `${params.size}x${params.size}`);
  url.searchParams.set('scale', String(params.scale));
  url.searchParams.set('maptype', 'satellite');
  url.searchParams.set('key', apiKey);

  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Google Static Maps API request failed: ${res.status}${body ? ` — ${body.slice(0, 200)}` : ''}`);
  }
  const contentType = res.headers.get('content-type') ?? 'image/png';
  const buffer = Buffer.from(await res.arrayBuffer());
  return { buffer, contentType };
}
