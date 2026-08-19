#!/bin/sh
# Idempotent GeoServer REST provisioning: workspace -> PostGIS datastore ->
# "ports" and "airfields" feature types -> their styles -> assign styles as
# default. Safe to run again against an already-provisioned data_dir (each
# step just no-ops with a non-2xx response, which is ignored).
set -u

GS_USER="${GEOSERVER_ADMIN_USER:-admin}"
GS_PASS="${GEOSERVER_ADMIN_PASSWORD:-meridian}"
GS="http://${GS_USER}:${GS_PASS}@geoserver:8080/geoserver/rest"
PG_HOST="${POSTGIS_HOST:-postgis}"
PG_DB="${POSTGRES_DB:-meridian}"
PG_USER="${POSTGRES_USER:-meridian}"
PG_PASS="${POSTGRES_PASSWORD:-meridian}"

echo "Waiting for GeoServer REST API..."
until curl -sf -o /dev/null "http://geoserver:8080/geoserver/web/"; do sleep 3; done

echo "Creating workspace 'meridian'..."
curl -s -o /dev/null -X POST -H "Content-Type: application/json" \
  -d '{"workspace":{"name":"meridian"}}' \
  "$GS/workspaces" || true

echo "Creating PostGIS datastore 'ports_pg'..."
curl -s -o /dev/null -X POST -H "Content-Type: application/json" \
  -d "{\"dataStore\":{\"name\":\"ports_pg\",\"connectionParameters\":{\"entry\":[
    {\"@key\":\"host\",\"\$\":\"${PG_HOST}\"},{\"@key\":\"port\",\"\$\":\"5432\"},
    {\"@key\":\"database\",\"\$\":\"${PG_DB}\"},{\"@key\":\"user\",\"\$\":\"${PG_USER}\"},
    {\"@key\":\"passwd\",\"\$\":\"${PG_PASS}\"},{\"@key\":\"dbtype\",\"\$\":\"postgis\"},{\"@key\":\"schema\",\"\$\":\"public\"}
  ]}}}" \
  "$GS/workspaces/meridian/datastores" || true

echo "Publishing 'ports' feature type..."
curl -s -o /dev/null -X POST -H "Content-Type: application/json" \
  -d '{"featureType":{"name":"ports","nativeName":"ports","title":"Worldwide Maritime Ports (NGA WPI)","abstract":"Maritime ports of the world, sourced from NGA Publication 150 (World Port Index, 2019 edition).","srs":"EPSG:4326"}}' \
  "$GS/workspaces/meridian/datastores/ports_pg/featuretypes" || true

echo "Creating style 'meridian_ports'..."
curl -s -o /dev/null -X POST -H "Content-Type: application/json" \
  -d '{"style":{"name":"meridian_ports","filename":"meridian_ports.sld"}}' \
  "$GS/workspaces/meridian/styles" || true

echo "Uploading SLD body..."
curl -s -o /dev/null -X PUT -H "Content-Type: application/vnd.ogc.sld+xml" \
  --data-binary @/init/ports_style.sld \
  "$GS/workspaces/meridian/styles/meridian_ports"

echo "Setting default style on layer 'ports'..."
curl -s -o /dev/null -X PUT -H "Content-Type: application/json" \
  -d '{"layer":{"defaultStyle":{"name":"meridian_ports","workspace":"meridian"}}}' \
  "$GS/layers/meridian:ports"

echo "Publishing 'airfields' feature type..."
curl -s -o /dev/null -X POST -H "Content-Type: application/json" \
  -d '{"featureType":{"name":"airfields","nativeName":"airfields","title":"Airfields — Boundaries, Runways, Taxiways","abstract":"Airport boundary, runway, and taxiway polygons for the Strait of Gibraltar region, derived from OpenStreetMap (aeroway=aerodrome/runway/taxiway); runway/taxiway centerlines buffered to footprint polygons by tagged width.","srs":"EPSG:4326"}}' \
  "$GS/workspaces/meridian/datastores/ports_pg/featuretypes" || true

echo "Creating style 'meridian_airfields'..."
curl -s -o /dev/null -X POST -H "Content-Type: application/json" \
  -d '{"style":{"name":"meridian_airfields","filename":"meridian_airfields.sld"}}' \
  "$GS/workspaces/meridian/styles" || true

echo "Uploading SLD body..."
curl -s -o /dev/null -X PUT -H "Content-Type: application/vnd.ogc.sld+xml" \
  --data-binary @/init/airfields_style.sld \
  "$GS/workspaces/meridian/styles/meridian_airfields"

echo "Setting default style on layer 'airfields'..."
curl -s -o /dev/null -X PUT -H "Content-Type: application/json" \
  -d '{"layer":{"defaultStyle":{"name":"meridian_airfields","workspace":"meridian"}}}' \
  "$GS/layers/meridian:airfields"

echo "GeoServer provisioning complete."
