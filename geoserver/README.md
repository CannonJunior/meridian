# Context-layer GeoServer stack

Hosts "context layers" (fixed / externally-served reference geodata) for the
map. Meridian's intended scope is worldwide; several layers below are
currently bbox-scoped to the Strait of Gibraltar because that's this
project's first AO (see `web/src/mapProjection.ts`), not because Gibraltar
is the only region the project will ever cover — expect this list to grow
region-by-region over time, or for a regional layer to get swapped out for
a genuinely worldwide source once one is found (as already happened for
weather-radar):

- **ports** — worldwide maritime ports (points), NGA World Port Index.
- **airfields** — airport boundary / runway / taxiway polygons for the
  Strait of Gibraltar region (this project's current AO), from
  OpenStreetMap. Runway/taxiway centerlines are buffered
  to footprint polygons by their tagged width (PostGIS `ST_Buffer` on
  geography) since OSM rarely maps the paved surface as a polygon directly.
- **eez** — worldwide Exclusive Economic Zone boundary polygons (283
  national/territorial zones), from Flanders Marine Institute (VLIZ) Marine
  Regions World EEZ v12. The full-resolution world dataset is 200MB+ of
  GeoJSON, so each feature's geometry is simplified (Douglas-Peucker) in
  `generate_eez_sql.py` before being written out — no GDAL/shapely in this
  environment, so the simplification is pure Python.
- **shipping_lanes** — worldwide vessel shipping lanes (lines), two
  sources combined for what each is good at:
  `lane_type='major'/'middle'/'minor'` are Paul Benden's "Global Shipping
  Lanes" (CC BY-SA 4.0), hand-traced from the CIA's Map of The World's
  Oceans (Oct. 2012) — real curved traffic corridors (tens to hundreds of
  vertices per line), not a routing graph. `lane_type='chokepoint'` is the
  12 named straits/canals from Eurostat SeaRoute's `marnet` routing network
  (EUPL-1.2) — Suez, Panama, Malacca, Gibraltar, Dover, Bering, Magellan,
  Bab-el-Mandeb, Kiel, Corinth, NW/NE Passage. `marnet`'s general network
  was tried and dropped as the primary source: every edge in it, at every
  generalization resolution, is a straight 2-point segment, so it renders
  as straight lines across open ocean rather than lanes; straits are
  narrow enough that the same straightness looks correct there.
- **submarine_cables** — worldwide submarine telecommunication cable
  routes (lines, 1,404 cables), from OpenStreetMap's
  `seamark:type=cable_submarine` tag: real nautical-chart cable
  digitizations (most cite Kingfisher Information Service chart data), not
  landing-point-to-landing-point straight-line guesses. (TeleGeography's
  own cable map data — the best-known source — requires a paid license;
  the free community mirrors of it that exist carry landing-point metadata
  only, with no route geometry, so weren't usable here.) The raw OSM tag
  covers submarine cables generally, not just telecom ones — roughly 6,000
  of the ~8,700 raw ways worldwide turned out to be power/electrical
  interconnectors (tagged `power=cable` with `voltage`/`frequency`), which
  `generate_submarine_cables_sql.py` filters out by category. `status` is
  'abandoned' where OSM's own `disused` convention marks it so, otherwise
  'operational'. This used to be two EMODnet Human Activities national
  datasets (Spain's CICA, France's SHOM) — regionally accurate but only
  ever going to cover two countries — replaced with this worldwide OSM
  source once the project's scope was clarified as worldwide.
- **bathymetry_contours** — generalised depth-contour lines (50/100/200/
  500/1000/2000m) for the Strait of Gibraltar region (this project's
  current AO), from EMODnet
  Bathymetry's public WFS (GEBCO-derived). The service's own field is named
  `elevation` but every value returned is a positive depth-below-sea-level
  magnitude, not a signed elevation, so it's renamed `depth_m` here; a
  `depth_band` (shallow/mid/deep) column is also derived for client-side
  styling, since MapLibre's `match` expression needs a small discrete set
  to key on, not a continuous number. Same "too heavy to fetch whole"
  situation as EEZ (240 raw features / ~152k vertices in this bbox), so
  simplified the same way.

Consumed by the web app as WFS (GeoJSON); see `web/src/assets/contextLayers.ts`.
Two more layers are consumed directly as a live WMS raster rather than
GeoServer-hosted WFS — no PostGIS table, nothing in this directory:
**AIS Vessel Density** (EMODnet Human Activities' `vesseldensity_allavg`
layer) alongside the pre-existing **Weather Radar** (RainViewer). See
`ContextLayer.rasterTileUrl` in `contextLayers.ts`.

## Run

```
docker compose -f geoserver/docker-compose.yml up -d
```

Brings up, in order: PostGIS (auto-seeded from `postgis-init/*.sql` on first
start), GeoServer, then a one-shot `geoserver-init` container that
provisions the `meridian` workspace, the PostGIS datastore, the
`meridian:ports`, `meridian:airfields`, `meridian:eez`,
`meridian:shipping_lanes`, `meridian:submarine_cables` and
`meridian:bathymetry_contours` layers, and their styles via the GeoServer
REST API. Re-running `up` is safe — provisioning is idempotent and the
seed scripts only run once per fresh volume.

- GeoServer admin UI: http://localhost:8600/geoserver (`admin` / `meridian`)
- WFS endpoint used by the app: http://localhost:8600/geoserver/meridian/wfs
- PostGIS: `localhost:5555`, db/user/pass `meridian` / `meridian` / `meridian`

Override any of the above via env vars (`POSTGIS_PORT`, `GEOSERVER_PORT`,
`POSTGRES_PASSWORD`, `GEOSERVER_ADMIN_PASSWORD`, ...) or a `.env` file next
to `docker-compose.yml`.

## Stop / reset

```
docker compose -f geoserver/docker-compose.yml down       # stop, keep data
docker compose -f geoserver/docker-compose.yml down -v     # stop, wipe data
```

## Updating the datasets

See the header comments in `postgis-init/generate_ports_sql.py`,
`postgis-init/generate_airfields_sql.py`, `postgis-init/generate_eez_sql.py`,
`postgis-init/generate_shipping_lanes_sql.py`,
`postgis-init/generate_submarine_cables_sql.py` and
`postgis-init/generate_bathymetry_sql.py`.
