# Regenerates 60-submarine-cables.sql from a fresh worldwide Overpass API
# pull. Not run automatically — 60-submarine-cables.sql is checked in and
# picked up by postgres's docker-entrypoint-initdb.d on first container
# start. Re-run only to refresh the data:
#
#   curl -s --max-time 180 --data-urlencode 'data=[out:json][timeout:150];way["seamark:type"="cable_submarine"];out geom;' https://overpass-api.de/api/interpreter -o osm_cables_raw.json
#   python3 generate_submarine_cables_sql.py
#   mv submarine_cables.sql 60-submarine-cables.sql
#
# Source: OpenStreetMap contributors, `seamark:type=cable_submarine` — real
# nautical-chart cable digitizations (most cite "Kingfisher Information
# Service" chart data), worldwide, not a regional subset and not a paid
# TeleGeography license. This replaces an earlier version of this layer
# that combined two EMODnet Human Activities national datasets (Spain's
# CICA, France's SHOM) and was consequently only ever going to cover two
# countries' waters — Meridian's scope is worldwide (see mapProjection.ts),
# so a genuinely worldwide source was needed, not another regional one.
#
# `seamark:type=cable_submarine` covers submarine cables generally, not
# just telecom ones — ~6,000 of the ~8,700 ways worldwide turned out, on
# inspection, to be power/electrical interconnectors (tagged `power=cable`
# with `voltage`/`frequency`, e.g. UK-Ireland and Channel Islands grid
# links), not communications cables. Kept here: `category` in
# ('fibre_optic', 'fiber_optic', 'telephone') — explicitly telecom — or an
# untagged category paired with `communication=line` (the older/looser
# tagging convention many cables predate the category subtag with). This
# drops ~1,400 real telecom cables out of the raw ~8,700, and TeleGeography's
# well-known ones are recognizably present (CANTAT-3, Concerto 1, FLAG
# Europe-Asia, ...) with wikidata links confirming they're genuine.
#
# `status`: OSM's convention for a decommissioned feature is a `disused`
# tag (either `disused=yes` alongside the normal tags, or a `disused:`
# prefix on the primary tag itself) — mapped to 'abandoned'; everything
# else is presented as 'operational', matching how OSM itself presents it.
import json

RAW_PATH = 'osm_cables_raw.json'
TELECOM_CATEGORIES = {'fibre_optic', 'fiber_optic', 'telephone'}


def esc(v):
    if v is None:
        return 'NULL'
    s = str(v).replace("'", "''")
    return f"'{s}'"


def linestring_wkt(points):
    return 'LINESTRING(' + ','.join(f"{p['lon']} {p['lat']}" for p in points) + ')'


with open(RAW_PATH) as f:
    data = json.load(f)

rows = []  # (name, operator, category, status, wikidata, geom_sql)

for el in data['elements']:
    if el.get('type') != 'way' or 'geometry' not in el:
        continue
    tags = el.get('tags', {})
    category = tags.get('seamark:cable_submarine:category')
    communication = tags.get('communication')
    is_telecom = category in TELECOM_CATEGORIES or (category is None and communication == 'line')
    if not is_telecom:
        continue
    points = el['geometry']
    if len(points) < 2:
        continue
    status = 'abandoned' if tags.get('disused') == 'yes' or 'disused:seamark:type' in tags else 'operational'
    wkt = linestring_wkt(points)
    rows.append((
        tags.get('name'),
        tags.get('operator'),
        category or communication or 'unknown',
        status,
        tags.get('wikidata'),
        f"ST_SetSRID('{wkt}'::geometry, 4326)",
    ))

out = []
out.append("""
DROP TABLE IF EXISTS submarine_cables;
CREATE TABLE submarine_cables (
  id SERIAL PRIMARY KEY,
  name TEXT,
  operator TEXT,
  category TEXT NOT NULL,
  status TEXT NOT NULL,
  wikidata TEXT,
  geom geometry(LineString, 4326) NOT NULL
);
""")

for name, operator, category, status, wikidata, geom_sql in rows:
    out.append(
        "INSERT INTO submarine_cables (name,operator,category,status,wikidata,geom) VALUES "
        f"({esc(name)},{esc(operator)},{esc(category)},{esc(status)},{esc(wikidata)},{geom_sql});"
    )

out.append("CREATE INDEX submarine_cables_geom_idx ON submarine_cables USING GIST (geom);")
out.append("SELECT category, status, count(*) FROM submarine_cables GROUP BY category, status ORDER BY count(*) DESC;")

with open('submarine_cables.sql', 'w') as f:
    f.write('\n'.join(out))

print('rows written:', len(rows))
