# Context-layer GeoServer stack

Hosts "context layers" (fixed / externally-served reference geodata) for the
map:

- **ports** — worldwide maritime ports (points), NGA World Port Index.
- **airfields** — airport boundary / runway / taxiway polygons for the
  Strait of Gibraltar region (the real-world area this app's fictional AO is
  modeled on), from OpenStreetMap. Runway/taxiway centerlines are buffered
  to footprint polygons by their tagged width (PostGIS `ST_Buffer` on
  geography) since OSM rarely maps the paved surface as a polygon directly.

Consumed by the web app as WFS (GeoJSON); see `web/src/assets/contextLayers.ts`.

## Run

```
docker compose -f geoserver/docker-compose.yml up -d
```

Brings up, in order: PostGIS (auto-seeded from `postgis-init/*.sql` on first
start), GeoServer, then a one-shot `geoserver-init` container that
provisions the `meridian` workspace, the PostGIS datastore, the
`meridian:ports` and `meridian:airfields` layers, and their styles via the
GeoServer REST API. Re-running `up` is safe — provisioning is idempotent and
the seed scripts only run once per fresh volume.

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

See the header comments in `postgis-init/generate_ports_sql.py` and
`postgis-init/generate_airfields_sql.py`.
