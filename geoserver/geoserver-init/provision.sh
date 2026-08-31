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

# User-drawn shapes (see postgis-init/95-drawn-shapes.sql, drawing tool in
# web/src/components/DrawingToolManager.tsx) — the geometry + name/layer_id/
# object_id/object_label are published here through the same writable
# ports_pg datastore every reference layer above uses, so the traced
# polygon is real, externally-queryable GIS data (filterable by
# object_label via CQL_FILTER, same mechanism assets/contextLayers.ts's
# other filterProperty layers use) — not just an app-internal annotation.
#
# Published from drawn_shapes_geo, a view over drawn_shapes that excludes
# reference_image/reference_image_extent_* (see that schema file), rather
# than the table directly — GeoServer's REST API doesn't reliably support
# publishing a table while hiding one native column (an explicit attribute
# whitelist on the featureType create call 500'd with "Original feature
# type does not have a property named id", confirmed live against this
# GeoServer version), whereas a view naturally only exposes the columns
# it selects. The reference image itself is served by server/src/index.ts's
# own dedicated route instead.
echo "Publishing 'drawn_shapes' feature type..."
curl -s -o /dev/null -X POST -H "Content-Type: application/json" \
  -d '{"featureType":{"name":"drawn_shapes","nativeName":"drawn_shapes_geo","title":"Drawn Shapes","abstract":"User-traced polygons associated with a specific Maritime Ports/Airfields/Order-of-Battle object, created in-app via the drawing tool against captured Google satellite imagery.","srs":"EPSG:4326"}}' \
  "$GS/workspaces/meridian/datastores/ports_pg/featuretypes" || true

echo "Creating style 'meridian_drawn_shapes'..."
curl -s -o /dev/null -X POST -H "Content-Type: application/json" \
  -d '{"style":{"name":"meridian_drawn_shapes","filename":"meridian_drawn_shapes.sld"}}' \
  "$GS/workspaces/meridian/styles" || true

echo "Uploading SLD body..."
curl -s -o /dev/null -X PUT -H "Content-Type: application/vnd.ogc.sld+xml" \
  --data-binary @/init/drawn_shapes_style.sld \
  "$GS/workspaces/meridian/styles/meridian_drawn_shapes"

echo "Setting default style on layer 'drawn_shapes'..."
curl -s -o /dev/null -X PUT -H "Content-Type: application/json" \
  -d '{"layer":{"defaultStyle":{"name":"meridian_drawn_shapes","workspace":"meridian"}}}' \
  "$GS/layers/meridian:drawn_shapes"

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

# Timelapse capability (Phase 0) -- entity_track_history, published through
# its OWN datastore (history_ro_pg), not ports_pg. This is the load-bearing
# difference from every layer above: ports_pg connects as the meridian
# superuser role, which can write. history_ro_pg connects as
# meridian_history_ro (see postgis-init/100-history.sql), a role GRANTed
# SELECT only -- confirmed at the database level, not just assumed, by
# testing INSERT/DELETE/UPDATE against it directly. That's the chosen fix
# for this workspace's WFS-T service level being "Complete" (see
# 90-live-entities-triggers.sql): that setting is workspace-wide, not
# per-layer, so it can't be flipped for this one feature type without also
# breaking the live-entity edit round-trip every other layer above depends
# on. A second, read-only-at-the-database-level datastore sidesteps that
# entirely -- WFS-T against this layer fails with a database permission
# error, not a GeoServer config toggle that could regress silently.
#
# Password intentionally NOT threaded through an env var like
# POSTGRES_PASSWORD/GEOSERVER_ADMIN_PASSWORD above -- it must match
# postgis-init/100-history.sql's hardcoded dev-only credential exactly,
# and that file isn't env-parametrized either (same as every other seed
# script in postgis-init/).
HISTORY_RO_USER="meridian_history_ro"
HISTORY_RO_PASS="meridian_history_ro"

# "Expose primary keys" -- discovered live in Phase 2, not written on faith:
# without it, GeoServer's GML feature model absorbs a table's primary key
# into the feature's internal gml:id and does NOT expose it as a queryable/
# sortable attribute -- server/src/historyQuery.ts's queryHistoryFeatures()
# sorts by "event_time,event_id" specifically to give paginated results a
# deterministic tiebreaker when many rows share a timestamp, which silently
# 400s ("Illegal property name: event_id") without this parameter.
echo "Creating read-only PostGIS datastore 'history_ro_pg'..."
curl -s -o /dev/null -X POST -H "Content-Type: application/json" \
  -d "{\"dataStore\":{\"name\":\"history_ro_pg\",\"connectionParameters\":{\"entry\":[
    {\"@key\":\"host\",\"\$\":\"${PG_HOST}\"},{\"@key\":\"port\",\"\$\":\"5432\"},
    {\"@key\":\"database\",\"\$\":\"${PG_DB}\"},{\"@key\":\"user\",\"\$\":\"${HISTORY_RO_USER}\"},
    {\"@key\":\"passwd\",\"\$\":\"${HISTORY_RO_PASS}\"},{\"@key\":\"dbtype\",\"\$\":\"postgis\"},{\"@key\":\"schema\",\"\$\":\"public\"},
    {\"@key\":\"Expose primary keys\",\"\$\":\"true\"}
  ]}}}" \
  "$GS/workspaces/meridian/datastores" || true

# recalculate=nativebbox,latlonbbox forces GeoServer to compute the layer's
# bbox from the table's actual contents right now, rather than lazily on
# first request. Provisioning always runs after postgis-init has already
# loaded 101-history-fixtures.sql (postgis's init scripts complete before
# geoserver-init's depends_on: condition: service_healthy is satisfied), so
# this table is never empty at the moment this feature type is created --
# closing off the failure mode where a bbox gets cached from an empty table
# and BBOX-filtered queries silently misbehave after real data arrives.
echo "Publishing 'entity_track_history' feature type..."
curl -s -o /dev/null -X POST -H "Content-Type: application/json" \
  -d '{"featureType":{"name":"entity_track_history","nativeName":"entity_track_history","title":"Entity Track History (timelapse)","abstract":"Historical entity-position events for the timelapse capability, Kafka-sourced (see kafka/README.md) and ingested by server/src/kafkaHistoryConsumer.ts. Published read-only via history_ro_pg -- see this script'"'"'s comment above for why.","srs":"EPSG:4326"}}' \
  "$GS/workspaces/meridian/datastores/history_ro_pg/featuretypes?recalculate=nativebbox,latlonbbox" || true

# Time-dimension metadata on event_time -- a standards-based alternative to
# CQL_FILTER (a WFS/WMS TIME= param), offered in addition to it, not
# instead of it. This is the one provisioning step in this whole script
# with no precedent elsewhere here (every other step is a flat POST); if
# it 400s on a given GeoServer version, that's non-fatal to the timelapse
# feature -- CQL_FILTER (used by /api/history/query, Phase 2) is the
# primary, tested query path regardless of whether this succeeds.
echo "Enabling time dimension on 'entity_track_history' (event_time)..."
curl -s -o /dev/null -X PUT -H "Content-Type: application/json" \
  -d '{"featureType":{"metadata":{"entry":[{"@key":"time","dimensionInfo":{"enabled":true,"attribute":"event_time","presentation":"LIST","units":"ISO8601"}}]}}}' \
  "$GS/workspaces/meridian/datastores/history_ro_pg/featuretypes/entity_track_history" || true

echo "Creating style 'meridian_entity_track_history'..."
curl -s -o /dev/null -X POST -H "Content-Type: application/json" \
  -d '{"style":{"name":"meridian_entity_track_history","filename":"meridian_entity_track_history.sld"}}' \
  "$GS/workspaces/meridian/styles" || true

echo "Uploading SLD body..."
curl -s -o /dev/null -X PUT -H "Content-Type: application/vnd.ogc.sld+xml" \
  --data-binary @/init/history_style.sld \
  "$GS/workspaces/meridian/styles/meridian_entity_track_history"

echo "Setting default style on layer 'entity_track_history'..."
curl -s -o /dev/null -X PUT -H "Content-Type: application/json" \
  -d '{"layer":{"defaultStyle":{"name":"meridian_entity_track_history","workspace":"meridian"}}}' \
  "$GS/layers/meridian:entity_track_history"

# Live Domain Tracks — the domain-segmented live picture LayerManager.tsx's
# checkboxes control (see 110-live-domain-tracks.sql, kafka/README.md's
# "Live Domain Tracks" section). Published through the same history_ro_pg
# datastore as entity_track_history above, for the same reason: this
# server's Kafka consumer (liveDomainKafka.ts) is meant to be the only
# writer, and history_ro_pg's role connects read-only at the database level
# regardless of this workspace's WFS-T service setting. Styled with the
# same meridian_live_point default the two-way live-entity layers above
# use — these are the same kinds of markers, just a second, Kafka-fed
# projection of them, not a visually distinct dataset.
for ft in live_air_tracks:"Live Air Tracks" live_sea_tracks:"Live Sea Tracks" live_ground_tracks:"Live Ground Tracks" live_space_tracks:"Live Space Tracks"; do
  name="${ft%%:*}"
  title="${ft#*:}"

  echo "Publishing '$name' feature type..."
  curl -s -o /dev/null -X POST -H "Content-Type: application/json" \
    -d "{\"featureType\":{\"name\":\"$name\",\"nativeName\":\"$name\",\"title\":\"$title (live, Kafka-fed)\",\"abstract\":\"Meridian's live tactical picture, domain-segmented and republished onto Kafka by server/src/liveDomainKafka.ts, ingested here by the same module's consumer half. Published read-only via history_ro_pg -- see this script's comment above entity_track_history for why.\",\"srs\":\"EPSG:4326\"}}" \
    "$GS/workspaces/meridian/datastores/history_ro_pg/featuretypes?recalculate=nativebbox,latlonbbox" || true

  echo "Setting default style on layer '$name'..."
  curl -s -o /dev/null -X PUT -H "Content-Type: application/json" \
    -d '{"layer":{"defaultStyle":{"name":"meridian_live_point","workspace":"meridian"}}}' \
    "$GS/layers/meridian:$name"
done

echo "GeoServer provisioning complete."
