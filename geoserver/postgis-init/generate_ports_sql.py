# Regenerates 01-ports.sql from the source dataset. Not run automatically —
# 01-ports.sql is checked in and picked up by postgres's docker-entrypoint-
# initdb.d on first container start. Re-run this only to refresh the data:
#
#   curl -sL https://raw.githubusercontent.com/tayljordan/ports/main/ports.json -o ports.json
#   python3 generate_ports_sql.py
#   mv ports.sql 20-ports.sql
#
# Source: NGA Publication 150, World Port Index (2019 ed.), packaged as
# JSON by https://github.com/tayljordan/ports (5,410 ports).
import json

with open('ports.json') as f:
    data = json.load(f)

ports = data['ports']

def esc(v):
    if v is None:
        return 'NULL'
    if isinstance(v, bool):
        return 'TRUE' if v else 'FALSE'
    if isinstance(v, (int, float)):
        return str(v)
    s = str(v).replace("'", "''")
    return f"'{s}'"

out = []
out.append("""
DROP TABLE IF EXISTS ports;
CREATE TABLE ports (
  id SERIAL PRIMARY KEY,
  wpi_port_id INTEGER,
  name TEXT NOT NULL,
  country TEXT,
  state TEXT,
  port_size TEXT,
  max_vessel_size TEXT,
  cargo_pier_depth_max_m DOUBLE PRECISION,
  geom geometry(Point, 4326) NOT NULL
);
""")

for p in ports:
    lat = p.get('latitude')
    lon = p.get('longitude')
    if lat is None or lon is None:
        continue
    name = p.get('wpi_port_name') or p.get('point_of_interest') or 'UNNAMED'
    out.append(
        "INSERT INTO ports (wpi_port_id,name,country,state,port_size,max_vessel_size,cargo_pier_depth_max_m,geom) VALUES "
        f"({esc(p.get('wpi_port_id'))},{esc(name)},{esc(p.get('country'))},{esc(p.get('state'))},"
        f"{esc(p.get('port_size'))},{esc(p.get('max_vessel_size'))},{esc(p.get('cargo_pier_depth_max_m'))},"
        f"ST_SetSRID(ST_MakePoint({lon},{lat}),4326));"
    )

out.append("CREATE INDEX ports_geom_idx ON ports USING GIST (geom);")
out.append("SELECT count(*) FROM ports;")

with open('ports.sql', 'w') as f:
    f.write('\n'.join(out))

print('rows written:', len(ports))
