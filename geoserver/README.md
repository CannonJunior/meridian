# Context-layer GeoServer stack

Hosts "context layers" (fixed / externally-served reference geodata) for the
map:

- **ports** — worldwide maritime ports (points), NGA World Port Index.
- **airfields** — airport boundary / runway / taxiway polygons for the
  Strait of Gibraltar region (the real-world area this app's fictional AO is
  modeled on), from OpenStreetMap. Runway/taxiway centerlines are buffered
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

Consumed by the web app as WFS (GeoJSON); see `web/src/assets/contextLayers.ts`.

## Run

```
docker compose -f geoserver/docker-compose.yml up -d
```

Brings up, in order: PostGIS (auto-seeded from `postgis-init/*.sql` on first
start), GeoServer, then a one-shot `geoserver-init` container that
provisions the `meridian` workspace, the PostGIS datastore, the
`meridian:ports`, `meridian:airfields`, `meridian:eez` and
`meridian:shipping_lanes` layers, and their styles via the GeoServer REST
API. Re-running `up` is safe — provisioning is idempotent and the seed
scripts only run once per fresh volume.

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
`postgis-init/generate_airfields_sql.py`, `postgis-init/generate_eez_sql.py`
and `postgis-init/generate_shipping_lanes_sql.py`.
