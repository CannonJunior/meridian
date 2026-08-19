# Regenerates 30-airfields.sql from a fresh Overpass API pull. Not run
# automatically — 30-airfields.sql is checked in and picked up by postgres's
# docker-entrypoint-initdb.d on first container start. Re-run only to refresh
# the data (region is the Strait of Gibraltar area: south Spain / Gibraltar /
# N. Morocco — the real-world area this app's fictional AO is modeled on;
# widen the bbox below for broader coverage):
#
#   curl -s --data-urlencode 'data=[out:json][timeout:120];(way["aeroway"="aerodrome"](34.5,-9.0,38.0,-4.5);relation["aeroway"="aerodrome"](34.5,-9.0,38.0,-4.5);way["aeroway"="runway"](34.5,-9.0,38.0,-4.5);way["area:aeroway"="runway"](34.5,-9.0,38.0,-4.5);way["aeroway"="taxiway"](34.5,-9.0,38.0,-4.5);way["area:aeroway"="taxiway"](34.5,-9.0,38.0,-4.5););out geom;' \
#     https://overpass-api.de/api/interpreter -o airfields_raw.json
#   python3 generate_airfields_sql.py
#   mv airfields.sql 30-airfields.sql
#
# Source: OpenStreetMap contributors (aeroway=aerodrome/runway/taxiway),
# via Overpass API. Aerodrome boundaries are already mapped as polygons in
# OSM; runways and taxiways are almost always mapped as centerline
# LineStrings only, so we buffer them by their tagged `width` (falling back
# to a regional median where untagged: 45m runway / 23m taxiway) to produce
# a real footprint polygon, computed in PostGIS with ST_Buffer on geography
# (metre-accurate regardless of latitude).
import json

RUNWAY_DEFAULT_WIDTH_M = 45
TAXIWAY_DEFAULT_WIDTH_M = 23

with open('airfields_raw.json') as f:
    data = json.load(f)

elements = data['elements']


def esc(v):
    if v is None:
        return 'NULL'
    if isinstance(v, (int, float)):
        return str(v)
    s = str(v).replace("'", "''")
    return f"'{s}'"


def linestring_wkt(geometry):
    pts = ','.join(f"{p['lon']} {p['lat']}" for p in geometry)
    return f"LINESTRING({pts})"


def polygon_wkt(geometry):
    pts = list(geometry)
    if pts[0] != pts[-1]:
        pts = pts + [pts[0]]
    coords = ','.join(f"{p['lon']} {p['lat']}" for p in pts)
    return f"POLYGON(({coords}))"


rows = []  # (osm_id, name, icao, kind, ref, width_m, geom_sql)

for e in elements:
    tags = e.get('tags', {})
    aeroway = tags.get('aeroway')
    geometry = e.get('geometry')
    if not geometry:
        continue

    if aeroway == 'aerodrome':
        wkt = polygon_wkt(geometry)
        geom_sql = f"ST_SetSRID('{wkt}'::geometry, 4326)"
        rows.append((e['id'], tags.get('name'), tags.get('icao') or tags.get('iata'), 'boundary', None, None, geom_sql))
    elif aeroway in ('runway', 'taxiway'):
        width = tags.get('width')
        try:
            width_m = float(width) if width else (RUNWAY_DEFAULT_WIDTH_M if aeroway == 'runway' else TAXIWAY_DEFAULT_WIDTH_M)
        except ValueError:
            width_m = RUNWAY_DEFAULT_WIDTH_M if aeroway == 'runway' else TAXIWAY_DEFAULT_WIDTH_M
        wkt = linestring_wkt(geometry)
        geom_sql = f"ST_Buffer(ST_SetSRID('{wkt}'::geometry, 4326)::geography, {width_m / 2})::geometry"
        rows.append((e['id'], tags.get('name'), None, aeroway, tags.get('ref'), width_m, geom_sql))

out = []
out.append("""
DROP TABLE IF EXISTS airfields;
CREATE TABLE airfields (
  id SERIAL PRIMARY KEY,
  osm_id BIGINT,
  name TEXT,
  icao TEXT,
  kind TEXT NOT NULL,
  ref TEXT,
  width_m DOUBLE PRECISION,
  geom geometry(Geometry, 4326) NOT NULL
);
""")

for osm_id, name, icao, kind, ref, width_m, geom_sql in rows:
    out.append(
        "INSERT INTO airfields (osm_id,name,icao,kind,ref,width_m,geom) VALUES "
        f"({esc(osm_id)},{esc(name)},{esc(icao)},{esc(kind)},{esc(ref)},{esc(width_m)},{geom_sql});"
    )

# One representative point per airfield, derived from its boundary polygon
# and guaranteed to fall inside the shape (ST_PointOnSurface — unlike a
# bbox/centroid average, which can land outside a concave or L-shaped
# boundary such as Gibraltar's). This is the sole clickable feature for the
# object card; the boundary/runway/taxiway polygons stay non-interactive.
out.append("""
INSERT INTO airfields (osm_id, name, icao, kind, ref, width_m, geom)
SELECT osm_id, name, icao, 'centerpoint', NULL, NULL, ST_PointOnSurface(geom)
FROM airfields WHERE kind = 'boundary';
""")

out.append("CREATE INDEX airfields_geom_idx ON airfields USING GIST (geom);")
out.append("SELECT kind, count(*) FROM airfields GROUP BY kind;")

with open('airfields.sql', 'w') as f:
    f.write('\n'.join(out))

print('rows written:', len(rows))
