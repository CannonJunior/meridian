# Regenerates 40-eez.sql from a fresh Marine Regions WFS pull (worldwide).
# Not run automatically — 40-eez.sql is checked in and picked up by
# postgres's docker-entrypoint-initdb.d on first container start. Re-run
# only to refresh the data:
#
#   curl -s --max-time 600 "https://geo.vliz.be/geoserver/MarineRegions/wfs?service=WFS&version=1.0.0&request=GetFeature&typeName=eez&outputFormat=application/json" -o eez_raw.json
#   python3 generate_eez_sql.py
#   mv eez.sql 40-eez.sql
#
# Source: Flanders Marine Institute (VLIZ), Marine Regions — World EEZ v12,
# served live via their public WFS (https://www.marineregions.org/, CC BY
# 4.0, credit "Flanders Marine Institute (2023). Marine Regions: Maritime
# Boundaries Geodatabase"). The full-resolution world dataset (285 EEZ
# features, coastline-detail vertices) is well over 100MB of GeoJSON — too
# heavy for this app's context-layer loader, which fetches a layer's whole
# FeatureCollection in one WFS request and renders it as a native MapLibre
# vector layer client-side (no server-side tiling). Every ring is
# simplified with a pure-Python Douglas-Peucker pass (no GDAL/shapely
# available in this environment) before being written out, which is the
# same "keep it small enough to fetch once" rationale as the runway-
# buffering approximation in generate_airfields_sql.py.
import json

SIMPLIFY_TOLERANCE_DEG = 0.02  # ~2km at the equator


def esc(v):
    if v is None:
        return 'NULL'
    if isinstance(v, bool):
        return 'TRUE' if v else 'FALSE'
    if isinstance(v, (int, float)):
        return str(v)
    s = str(v).replace("'", "''")
    return f"'{s}'"


def simplify_ring(points, tolerance):
    """Iterative Douglas-Peucker (stack-based, not recursive — some
    coastlines/rings here have 100k+ vertices, well past Python's default
    recursion limit)."""
    n = len(points)
    if n <= 4:
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


def simplify_multipolygon(coordinates, tolerance):
    polys_out = []
    for rings in coordinates:
        simplified_rings = []
        for i, ring in enumerate(rings):
            s = simplify_ring([tuple(pt) for pt in ring], tolerance)
            if len(s) < 4:
                if i == 0:
                    simplified_rings = []
                    break
                continue
            simplified_rings.append(s)
        if simplified_rings:
            polys_out.append(simplified_rings)
    return polys_out


def multipolygon_wkt(polys):
    def ring_wkt(ring):
        return '(' + ','.join(f"{x} {y}" for x, y in ring) + ')'

    poly_strs = ['(' + ','.join(ring_wkt(r) for r in rings) + ')' for rings in polys]
    return f"MULTIPOLYGON({','.join(poly_strs)})"


with open('eez_raw.json') as f:
    data = json.load(f)

rows = []  # (mrgid_eez, geoname, pol_type, territory1, sovereign1, iso_ter1, area_km2, geom_sql)

for feat in data['features']:
    p = feat['properties']
    geom = feat['geometry']
    coords = geom['coordinates'] if geom['type'] == 'MultiPolygon' else [geom['coordinates']]
    simplified = simplify_multipolygon(coords, SIMPLIFY_TOLERANCE_DEG)
    if not simplified:
        # Sub-tolerance features (a handful of small disputed-islet claims,
        # each well under ~2km across) collapse to nothing at this
        # tolerance and are dropped rather than kept as degenerate slivers.
        continue
    wkt = multipolygon_wkt(simplified)
    geom_sql = f"ST_SetSRID('{wkt}'::geometry, 4326)"
    rows.append((
        p.get('mrgid_eez'), p.get('geoname'), p.get('pol_type'),
        p.get('territory1'), p.get('sovereign1'), p.get('iso_ter1'),
        p.get('area_km2'), geom_sql,
    ))

out = []
out.append("""
DROP TABLE IF EXISTS eez;
CREATE TABLE eez (
  id SERIAL PRIMARY KEY,
  mrgid_eez INTEGER,
  geoname TEXT NOT NULL,
  pol_type TEXT,
  territory TEXT,
  sovereign TEXT,
  iso_ter TEXT,
  area_km2 DOUBLE PRECISION,
  geom geometry(MultiPolygon, 4326) NOT NULL
);
""")

for mrgid_eez, geoname, pol_type, territory, sovereign, iso_ter, area_km2, geom_sql in rows:
    out.append(
        "INSERT INTO eez (mrgid_eez,geoname,pol_type,territory,sovereign,iso_ter,area_km2,geom) VALUES "
        f"({esc(mrgid_eez)},{esc(geoname)},{esc(pol_type)},{esc(territory)},{esc(sovereign)},{esc(iso_ter)},{esc(area_km2)},{geom_sql});"
    )

out.append("CREATE INDEX eez_geom_idx ON eez USING GIST (geom);")
out.append("SELECT count(*) FROM eez;")

with open('eez.sql', 'w') as f:
    f.write('\n'.join(out))

print('rows written:', len(rows))
