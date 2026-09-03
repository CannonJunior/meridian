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

## Entity Track History (timelapse capability)

`meridian:entity_track_history` — historical entity-position events fed by
the `kafka/` stack (see `kafka/README.md`) and ingested by
`server/src/kafkaHistoryConsumer.ts` (Phase 1; not built yet — this layer
exists and is queryable, but nothing is populating it beyond Phase 0's
fixtures until then). Different from every layer above in two ways:

- **Published through its own datastore, `history_ro_pg`**, not `ports_pg`.
  `history_ro_pg` connects as `meridian_history_ro`, a Postgres role
  GRANTed `SELECT` only (`postgis-init/100-history.sql`) — confirmed by
  attempting `INSERT`/`UPDATE`/`DELETE` directly against it (all rejected
  with `permission denied`) and by attempting a WFS-T `Insert` against the
  layer itself, which GeoServer rejects with `{...}entity_track_history is
  read-only` rather than a raw database error. This is the chosen fix for
  this workspace's WFS-T service level being "Complete" (see
  `90-live-entities-triggers.sql`): that setting is workspace-wide, so a
  per-layer toggle isn't available, and a second datastore backed by a
  read-only role was chosen over GeoServer's Security ACL subsystem.
- **`affiliation` and `speed_kn` are real columns**, not buried in the
  `attrs` JSONB catch-all — specifically so plain `CQL_FILTER` can reach
  them. If you add a new promoted column here, it must also be added to
  the query API's field whitelist (Phase 2) and the Kafka message schema
  (`kafka/README.md`) — nothing enforces these three staying in sync.

**`layer_id` values.** `history-vessel-tracks` is Phase 0/1's — seeded by
`postgis-init/101-history-fixtures.sql` and, once built, the Kafka
pipeline. `history-air-tracks` (added for the "Rolling Air Picture" ATO
plan's Phase D) is fixture-only: seeded by `server/src/seed.ts`'s
`SEED_AIR_TRACK_HISTORY`, inserted directly by `server/src/db.ts`'s
`seedFresh()` rather than through `postgis-init/` or Kafka, because its
event times have to land inside whichever `Sortie` fixture it belongs to's
own dynamically-computed TOT window — a static SQL file can't know that
at Docker-init time, and there's no live air-track Kafka producer yet.
`history-ground-events` and `history-space-tracks` are real external data
— GDELT news-mention locations and CelesTrak/SGP4-propagated satellite
positions respectively, published live by `kafka/producer-gdelt` and
`kafka/producer-celestrak` (see `kafka/README.md`'s "Message schema"
section for both). Unlike the two layers above, there is no fixture for
either — they only have rows once those producer containers are actually
running. All four values are whitelisted in `server/src/historyQuery.ts`'s
`ALLOWED_LAYER_IDS`; adding a fifth layer means adding it there too.

**Axis order — read before writing any BBOX query against this layer.**
Verified live during Phase 0: this GeoServer instance requires **lat,lon
(northing, easting) order** for EPSG:4326 BBOX filtering — both the raw
WFS `BBOX` KVP parameter and CQL's `BBOX()` function — regardless of WFS
version (1.1.0 and 2.0.0 both behave this way here). The intuitive
`west,south,east,north` (lon,lat) order silently returns **zero results**,
not an error:

```
# Wrong — lon,lat order, returns nothing, no error:
BBOX=-6.05,35.75,-5.6,36.25

# Right — lat,lon order:
BBOX=35.75,-6.05,36.25,-5.6

# Also right — CQL, same lat,lon order:
CQL_FILTER=BBOX(geom,35.75,-6.05,36.25,-5.6)
```

No layer in this workspace issued a BBOX-filtered WFS query before Phase
0 (the app fetches whole layers and filters client-side), so this hadn't
surfaced until now. Phase 2's `/api/history/query` must build its
CQL_FILTER in this order, and its test suite must include a query
narrow enough that getting the order wrong produces a visibly wrong
(non-empty-but-incomplete, or empty) result rather than passing by
accident on a query broad enough to match everything either way.

Time-dimension metadata (`event_time`, `presentation=LIST`) is also
enabled on this layer as a standards-based `TIME=` alternative to
CQL_FILTER — offered in addition to it, not instead; CQL_FILTER remains
the primary, tested query path.

## Run

```
docker compose -f geoserver/docker-compose.yml up -d
```

Brings up, in order: PostGIS (auto-seeded from `postgis-init/*.sql` on first
start — this now includes `entity_track_history`'s schema, read-only role,
and Phase 0 fixtures), GeoServer, then a one-shot `geoserver-init`
container that provisions the `meridian` workspace, the PostGIS
datastores (`ports_pg` for every reference/live layer, `history_ro_pg` for
`entity_track_history` — see "Entity Track History" above), the
`meridian:ports`, `meridian:airfields`, `meridian:eez`,
`meridian:shipping_lanes`, `meridian:submarine_cables`,
`meridian:bathymetry_contours` and `meridian:entity_track_history` layers,
and their styles via the GeoServer REST API. Re-running `up` is safe —
provisioning is idempotent and the seed scripts only run once per fresh
volume.

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

## Updating layer styles (SLDs)

`geoserver-init/{ports,airfields,eez,shipping_lanes,submarine_cables,
bathymetry,drawn_shapes}_style.sld` are generated files — do not hand-edit
them. Their content (every color/width/opacity value) is sourced from
`web/src/assets/layerColors.json`, which is *also* what
`web/src/assets/contextLayers.ts` and `web/src/components/TacticalMap.tsx`
read to style the same layers in the app's own OpenLayers rendering (the
SLDs only affect non-OpenLayers WMS consumers — GeoServer's own layer
preview, QGIS, etc. — not this app's map). To change a color, edit
`layerColors.json` once, then:

```
python3 geoserver-init/generate_slds.py
```

`live_point_style.sld`, `nais_style.sld` and `history_style.sld` are not
part of this — the live tactical picture has no OpenLayers-side equivalent
to drift from (it's rendered from the WebSocket feed, not WFS/SLD; see
provision.sh's "Live Domain Tracks" comment), so those three remain
hand-maintained.
