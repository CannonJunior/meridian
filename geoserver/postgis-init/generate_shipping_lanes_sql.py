# Regenerates 50-shipping-lanes.sql from two source datasets combined. Not
# run automatically — 50-shipping-lanes.sql is checked in and picked up by
# postgres's docker-entrypoint-initdb.d on first container start. Re-run
# only to refresh the data:
#
#   curl -sL "https://raw.githubusercontent.com/newzealandpaul/Shipping-Lanes/main/data/Shipping_Lanes_v1.geojson" -o shipping_lanes_raw.geojson
#   curl -sL "https://github.com/eurostat/searoute/raw/master/modules/core/src/main/resources/marnet/marnet_plus_20km.gpkg" -o marnet.gpkg
#   python3 generate_shipping_lanes_sql.py
#   mv shipping_lanes.sql 50-shipping-lanes.sql
#
# Two sources, used for what each is actually good at:
#
# - General lanes (lane_type major/middle/minor): Paul Benden's "Global
#   Shipping Lanes" (CC BY-SA 4.0, https://doi.org/10.5281/zenodo.6361763),
#   hand-traced from the CIA's "Map of The World's Oceans" (Oct. 2012).
#   This is a wall-map digitization, not a routing graph, so its paths
#   follow real curved traffic corridors (tens to hundreds of vertices per
#   line) instead of straight graph edges.
#
# - Chokepoints (lane_type chokepoint): Eurostat SeaRoute's `marnet`
#   network (EUPL-1.2, https://github.com/eurostat/searoute) — see
#   generate_eez_sql.py's sibling comment history for why marnet itself
#   was dropped as the general-lanes source: it's a shortest-path routing
#   graph, and *every* edge in it — at every generalization resolution —
#   is a straight 2-point segment between waypoints, so rendering it
#   directly just looks like straight lines across open ocean. Its one
#   genuinely useful piece is the `pass` tag it puts on segments running
#   through the 12 named straits/canals it recognizes for routing (Suez,
#   Panama, Malacca, Gibraltar, Dover, Bering, Magellan, Bab-el-Mandeb,
#   Kiel, Corinth, Northwest/Northeast Passage) — several of which matter
#   directly to this project's current Strait of Gibraltar AO, though this
#   dataset is worldwide and will keep being useful as more AOs are added
#   elsewhere. Straits are narrow,
#   direct transits in reality, so a straight segment there isn't the
#   visual problem it is for open-ocean routes; only those pass-tagged
#   segments are kept, the rest of marnet is discarded.
#
# Both sources ship in different formats needing different handling: the
# CIA-derived set is plain GeoJSON (json stdlib); marnet is a GeoPackage
# (SQLite + OGC binary geometry blobs) — no GDAL/ogr2ogr/fiona in this
# environment, so it's read directly with the stdlib sqlite3 module plus a
# small GeoPackage-binary/WKB LineString parser.
import json
import sqlite3
import struct

CIA_PATH = 'shipping_lanes_raw.geojson'
MARNET_PATH = 'marnet.gpkg'
MARNET_TABLE = 'type'


def esc(v):
    if v is None:
        return 'NULL'
    s = str(v).replace("'", "''")
    return f"'{s}'"


def multilinestring_wkt(lines):
    def line_wkt(line):
        return '(' + ','.join(f"{x} {y}" for x, y in line) + ')'

    return f"MULTILINESTRING({','.join(line_wkt(l) for l in lines)})"


def parse_gpkg_geom(blob):
    """GeoPackage Binary header (magic 'GP', version, flags[, envelope])
    followed by a standard WKB geometry. Envelope size is encoded in flags
    bits 1-3; we only need to skip past it, not read it."""
    flags = blob[3]
    envelope_sizes = {0: 0, 1: 32, 2: 48, 3: 48, 4: 64}
    env_len = envelope_sizes[(flags >> 1) & 0x07]
    return parse_wkb_linestring(blob[8 + env_len:])


def parse_wkb_linestring(wkb):
    endian = '<' if wkb[0] == 1 else '>'
    geom_type = struct.unpack(endian + 'I', wkb[1:5])[0]
    if geom_type != 2:  # LineString
        raise ValueError(f'unhandled WKB geometry type {geom_type}')
    n = struct.unpack(endian + 'I', wkb[5:9])[0]
    pts = []
    off = 9
    for _ in range(n):
        x, y = struct.unpack(endian + 'dd', wkb[off:off + 16])
        pts.append((x, y))
        off += 16
    return pts


rows = []  # (lane_type, pass, geom_sql)

with open(CIA_PATH) as f:
    cia = json.load(f)
for feat in cia['features']:
    lane_type = feat['properties']['Type'].lower()
    wkt = multilinestring_wkt(feat['geometry']['coordinates'])
    rows.append((lane_type, None, f"ST_SetSRID('{wkt}'::geometry, 4326)"))

con = sqlite3.connect(MARNET_PATH)
cur = con.cursor()
by_pass = {}
for fid, geom, pass_val in cur.execute(f'SELECT fid, geometry, pass FROM {MARNET_TABLE} WHERE pass IS NOT NULL'):
    by_pass.setdefault(pass_val, []).append(parse_gpkg_geom(geom))
for pass_val, lines in sorted(by_pass.items()):
    wkt = multilinestring_wkt(lines)
    rows.append(('chokepoint', pass_val, f"ST_SetSRID('{wkt}'::geometry, 4326)"))

out = []
out.append("""
DROP TABLE IF EXISTS shipping_lanes;
CREATE TABLE shipping_lanes (
  id SERIAL PRIMARY KEY,
  lane_type TEXT NOT NULL,
  pass TEXT,
  geom geometry(MultiLineString, 4326) NOT NULL
);
""")

for lane_type, pass_val, geom_sql in rows:
    out.append(
        "INSERT INTO shipping_lanes (lane_type,pass,geom) VALUES "
        f"({esc(lane_type)},{esc(pass_val)},{geom_sql});"
    )

out.append("CREATE INDEX shipping_lanes_geom_idx ON shipping_lanes USING GIST (geom);")
out.append("SELECT lane_type, count(*) FROM shipping_lanes GROUP BY lane_type;")

with open('shipping_lanes.sql', 'w') as f:
    f.write('\n'.join(out))

print('rows written:', len(rows))
