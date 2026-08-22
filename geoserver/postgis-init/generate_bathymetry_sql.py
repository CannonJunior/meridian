# Regenerates 70-bathymetry.sql from a fresh EMODnet Bathymetry WFS pull
# (no API key), bbox-limited to the Strait of Gibraltar region (same south
# Spain / Gibraltar / N. Morocco extent as generate_airfields_sql.py:
# 34.5,-9.0,38.0,-4.5). Not run automatically — 70-bathymetry.sql is
# checked in and picked up by postgres's docker-entrypoint-initdb.d on
# first container start. Re-run only to refresh the data:
#
#   curl -s --max-time 120 "https://ows.emodnet-bathymetry.eu/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=emodnet:contours&outputFormat=application/json&bbox=-9.0,34.5,-4.5,38.0,EPSG:4326" -o contours_raw.geojson
#   python3 generate_bathymetry_sql.py
#   mv bathymetry.sql 70-bathymetry.sql
#
# Source: EMODnet Bathymetry (https://emodnet.ec.europa.eu/en/bathymetry),
# generalised depth-contour lines derived from the GEBCO grid, served live
# via their public WFS (CC BY 4.0, credit "EMODnet Bathymetry Consortium
# (2020): EMODnet Digital Bathymetry (DTM 2020)"). The service's own field
# is named `elevation`, but every value returned in this bbox is a positive
# standard contour interval (50/100/200/500/1000/2000m) — i.e. it is really
# depth-below-sea-level in meters, not a signed elevation — so this script
# renames it to `depth_m` for clarity rather than passing the confusing
# name straight through. 240 raw features / ~152k vertices in this bbox is
# too heavy to fetch as one WFS GeoJSON response on every page load (the
# same "too heavy" call made for EEZ), so every line gets the identical
# pure-Python Douglas-Peucker pass generate_eez_sql.py already uses.
import json

SIMPLIFY_TOLERANCE_DEG = 0.01  # ~1km at this latitude — finer than EEZ's 0.02 since local contour shape (the strait sill) is the point of this layer


def esc(v):
    if v is None:
        return 'NULL'
    if isinstance(v, (int, float)):
        return str(v)
    s = str(v).replace("'", "''")
    return f"'{s}'"


def simplify_line(points, tolerance):
    """Iterative Douglas-Peucker (stack-based, not recursive) — same
    implementation as generate_eez_sql.py's simplify_ring, applied to open
    lines rather than closed rings (no first==last point assumption)."""
    n = len(points)
    if n <= 2:
        return points

    keep = bytearray(n)
    keep[0] = 1
    keep[-1] = 1
    stack = [(0, n - 1)]
    while stack:
        start, end = stack.pop()
        if end <= start + 1:
            continue
        x1, y1 = points[start]
        x2, y2 = points[end]
        dx, dy = x2 - x1, y2 - y1
        norm = (dx * dx + dy * dy) ** 0.5
        max_dist = -1.0
        max_idx = -1
        for i in range(start + 1, end):
            x0, y0 = points[i]
            if norm == 0:
                dist = ((x0 - x1) ** 2 + (y0 - y1) ** 2) ** 0.5
            else:
                dist = abs(dy * x0 - dx * y0 + x2 * y1 - y2 * x1) / norm
            if dist > max_dist:
                max_dist = dist
                max_idx = i
        if max_dist > tolerance:
            keep[max_idx] = 1
            stack.append((start, max_idx))
            stack.append((max_idx, end))

    return [p for p, k in zip(points, keep) if k]


def linestring_wkt(points):
    return 'LINESTRING(' + ','.join(f"{x} {y}" for x, y in points) + ')'


def depth_band(depth_m):
    """Mirrors geoserver-init/bathymetry_style.sld's three rules — a
    purpose-built categorical column so the client can key a MapLibre
    `match` expression off it directly (the same role lane_type/status play
    for shipping_lanes/submarine_cables), since depth_m itself is a
    continuous number, not a small discrete set MapLibre `match` can key
    on."""
    if depth_m < 200:
        return 'shallow'
    if depth_m < 1000:
        return 'mid'
    return 'deep'


with open('contours_raw.geojson') as f:
    data = json.load(f)

rows = []  # (depth_m, depth_band, geom_sql)

for feat in data['features']:
    depth_m = feat['properties'].get('elevation')
    points = [tuple(pt) for pt in feat['geometry']['coordinates']]
    simplified = simplify_line(points, SIMPLIFY_TOLERANCE_DEG)
    if len(simplified) < 2:
        continue
    wkt = linestring_wkt(simplified)
    rows.append((depth_m, depth_band(depth_m), f"ST_SetSRID('{wkt}'::geometry, 4326)"))

out = []
out.append("""
DROP TABLE IF EXISTS bathymetry_contours;
CREATE TABLE bathymetry_contours (
  id SERIAL PRIMARY KEY,
  depth_m DOUBLE PRECISION NOT NULL,
  depth_band TEXT NOT NULL,
  geom geometry(LineString, 4326) NOT NULL
);
""")

for depth_m, band, geom_sql in rows:
    out.append(f"INSERT INTO bathymetry_contours (depth_m,depth_band,geom) VALUES ({esc(depth_m)},{esc(band)},{geom_sql});")

out.append("CREATE INDEX bathymetry_contours_geom_idx ON bathymetry_contours USING GIST (geom);")
out.append("SELECT depth_m, count(*) FROM bathymetry_contours GROUP BY depth_m ORDER BY depth_m;")

with open('bathymetry.sql', 'w') as f:
    f.write('\n'.join(out))

print('rows written:', len(rows))
