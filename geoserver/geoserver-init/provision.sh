#!/bin/sh
# Idempotent GeoServer REST provisioning: workspace -> PostGIS datastore ->
# "ports", "airfields", "eez" and "shipping_lanes" feature types -> their
# styles -> assign styles as default. Safe to run again against an
# already-provisioned data_dir (each step just no-ops with a non-2xx
# response, which is ignored).
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

echo "Publishing 'eez' feature type..."
curl -s -o /dev/null -X POST -H "Content-Type: application/json" \
  -d '{"featureType":{"name":"eez","nativeName":"eez","title":"Exclusive Economic Zones (worldwide)","abstract":"Worldwide Exclusive Economic Zone boundaries, sourced from Flanders Marine Institute (VLIZ) Marine Regions World EEZ v12, geometry-simplified (Douglas-Peucker) for client-side rendering.","srs":"EPSG:4326"}}' \
  "$GS/workspaces/meridian/datastores/ports_pg/featuretypes" || true

echo "Creating style 'meridian_eez'..."
curl -s -o /dev/null -X POST -H "Content-Type: application/json" \
  -d '{"style":{"name":"meridian_eez","filename":"meridian_eez.sld"}}' \
  "$GS/workspaces/meridian/styles" || true

echo "Uploading SLD body..."
curl -s -o /dev/null -X PUT -H "Content-Type: application/vnd.ogc.sld+xml" \
  --data-binary @/init/eez_style.sld \
  "$GS/workspaces/meridian/styles/meridian_eez"

echo "Setting default style on layer 'eez'..."
curl -s -o /dev/null -X PUT -H "Content-Type: application/json" \
  -d '{"layer":{"defaultStyle":{"name":"meridian_eez","workspace":"meridian"}}}' \
  "$GS/layers/meridian:eez"

echo "Publishing 'shipping_lanes' feature type..."
curl -s -o /dev/null -X POST -H "Content-Type: application/json" \
  -d '{"featureType":{"name":"shipping_lanes","nativeName":"shipping_lanes","title":"Shipping Lanes (worldwide)","abstract":"Worldwide vessel shipping lanes. lane_type=major/middle/minor are hand-traced from the CIA'"'"'s Map of The World'"'"'s Oceans (Oct. 2012) by Paul Benden, CC BY-SA 4.0 -- real curved traffic corridors, not a routing graph. lane_type=chokepoint marks the 12 named straits/canals in Eurostat SeaRoute'"'"'s marnet routing network (EUPL-1.2): Suez, Panama, Malacca, Gibraltar, Dover, Bering, Magellan, Bab-el-Mandeb, Kiel, Corinth, NW/NE Passage.","srs":"EPSG:4326"}}' \
  "$GS/workspaces/meridian/datastores/ports_pg/featuretypes" || true

echo "Creating style 'meridian_shipping_lanes'..."
curl -s -o /dev/null -X POST -H "Content-Type: application/json" \
  -d '{"style":{"name":"meridian_shipping_lanes","filename":"meridian_shipping_lanes.sld"}}' \
  "$GS/workspaces/meridian/styles" || true

echo "Uploading SLD body..."
curl -s -o /dev/null -X PUT -H "Content-Type: application/vnd.ogc.sld+xml" \
  --data-binary @/init/shipping_lanes_style.sld \
  "$GS/workspaces/meridian/styles/meridian_shipping_lanes"

echo "Setting default style on layer 'shipping_lanes'..."
curl -s -o /dev/null -X PUT -H "Content-Type: application/json" \
  -d '{"layer":{"defaultStyle":{"name":"meridian_shipping_lanes","workspace":"meridian"}}}' \
  "$GS/layers/meridian:shipping_lanes"

echo "Publishing 'submarine_cables' feature type..."
curl -s -o /dev/null -X POST -H "Content-Type: application/json" \
  -d '{"featureType":{"name":"submarine_cables","nativeName":"submarine_cables","title":"Submarine Cables (worldwide)","abstract":"Worldwide submarine telecommunication cable routes, sourced from OpenStreetMap'"'"'s seamark:type=cable_submarine nautical-chart data (filtered to telecom categories -- fibre_optic/telephone -- excluding power/electrical interconnectors tagged with the same seamark type).","srs":"EPSG:4326"}}' \
  "$GS/workspaces/meridian/datastores/ports_pg/featuretypes" || true

echo "Creating style 'meridian_submarine_cables'..."
curl -s -o /dev/null -X POST -H "Content-Type: application/json" \
  -d '{"style":{"name":"meridian_submarine_cables","filename":"meridian_submarine_cables.sld"}}' \
  "$GS/workspaces/meridian/styles" || true

echo "Uploading SLD body..."
curl -s -o /dev/null -X PUT -H "Content-Type: application/vnd.ogc.sld+xml" \
  --data-binary @/init/submarine_cables_style.sld \
  "$GS/workspaces/meridian/styles/meridian_submarine_cables"

echo "Setting default style on layer 'submarine_cables'..."
curl -s -o /dev/null -X PUT -H "Content-Type: application/json" \
  -d '{"layer":{"defaultStyle":{"name":"meridian_submarine_cables","workspace":"meridian"}}}' \
  "$GS/layers/meridian:submarine_cables"

echo "Publishing 'bathymetry_contours' feature type..."
curl -s -o /dev/null -X POST -H "Content-Type: application/json" \
  -d '{"featureType":{"name":"bathymetry_contours","nativeName":"bathymetry_contours","title":"Bathymetry Contours (Strait of Gibraltar region)","abstract":"Generalised depth-contour lines (50/100/200/500/1000/2000m) for the Strait of Gibraltar region, derived from the GEBCO grid via EMODnet Bathymetry'"'"'s public WFS, geometry-simplified (Douglas-Peucker) for client-side rendering.","srs":"EPSG:4326"}}' \
  "$GS/workspaces/meridian/datastores/ports_pg/featuretypes" || true

echo "Creating style 'meridian_bathymetry'..."
curl -s -o /dev/null -X POST -H "Content-Type: application/json" \
  -d '{"style":{"name":"meridian_bathymetry","filename":"meridian_bathymetry.sld"}}' \
  "$GS/workspaces/meridian/styles" || true

echo "Uploading SLD body..."
curl -s -o /dev/null -X PUT -H "Content-Type: application/vnd.ogc.sld+xml" \
  --data-binary @/init/bathymetry_style.sld \
  "$GS/workspaces/meridian/styles/meridian_bathymetry"

echo "Setting default style on layer 'bathymetry_contours'..."
curl -s -o /dev/null -X PUT -H "Content-Type: application/json" \
  -d '{"layer":{"defaultStyle":{"name":"meridian_bathymetry","workspace":"meridian"}}}' \
  "$GS/layers/meridian:bathymetry_contours"

echo "Creating style 'meridian_live_point'..."
curl -s -o /dev/null -X POST -H "Content-Type: application/json" \
  -d '{"style":{"name":"meridian_live_point","filename":"meridian_live_point.sld"}}' \
  "$GS/workspaces/meridian/styles" || true

echo "Uploading SLD body..."
curl -s -o /dev/null -X PUT -H "Content-Type: application/vnd.ogc.sld+xml" \
  --data-binary @/init/live_point_style.sld \
  "$GS/workspaces/meridian/styles/meridian_live_point"

echo "Creating style 'meridian_nais'..."
curl -s -o /dev/null -X POST -H "Content-Type: application/json" \
  -d '{"style":{"name":"meridian_nais","filename":"meridian_nais.sld"}}' \
  "$GS/workspaces/meridian/styles" || true

echo "Uploading SLD body..."
curl -s -o /dev/null -X PUT -H "Content-Type: application/vnd.ogc.sld+xml" \
  --data-binary @/init/nais_style.sld \
  "$GS/workspaces/meridian/styles/meridian_nais"

# The live tactical picture — targets/sensors/effectors/friendly_units/nais.
# Schema lives in postgis-init/80-live-entities.sql, not generated here;
# unlike every reference layer above, the server (server/src/db.ts) owns
# writing to these tables at runtime, so publishing them just makes the
# live picture queryable over WFS by anything other than Meridian's own
# WebSocket client — GeoServer is a read mirror here, not the source of
# truth for what "live" means (see the Phase 1 plan for why: WFS has no
# push/subscribe mechanism, so real-time delivery to Meridian's own
# frontend still goes over the WebSocket, backed by these same tables).
for ft in targets:Targets sensors:Sensors "friendly_units:Friendly Units" nais:NAIs; do
  name="${ft%%:*}"
  title="${ft#*:}"
  style="meridian_live_point"
  [ "$name" = "nais" ] && style="meridian_nais"

  echo "Publishing '$name' feature type..."
  curl -s -o /dev/null -X POST -H "Content-Type: application/json" \
    -d "{\"featureType\":{\"name\":\"$name\",\"nativeName\":\"$name\",\"title\":\"$title (live)\",\"abstract\":\"Meridian's live tactical picture -- $name, written by the sim/action loop in server/src, mirrored here so it is queryable over WFS. Not a static reference layer like the others in this workspace.\",\"srs\":\"EPSG:4326\"}}" \
    "$GS/workspaces/meridian/datastores/ports_pg/featuretypes" || true

  echo "Setting default style on layer '$name'..."
  curl -s -o /dev/null -X PUT -H "Content-Type: application/json" \
    -d "{\"layer\":{\"defaultStyle\":{\"name\":\"$style\",\"workspace\":\"meridian\"}}}" \
    "$GS/layers/meridian:$name"
done

# effectors has no geometry column (it's not independently positioned --
# see types.ts) so it can't be a WFS feature type; it's queryable via the
# targets/friendly_units effector/effId fields instead.

echo "GeoServer provisioning complete."
