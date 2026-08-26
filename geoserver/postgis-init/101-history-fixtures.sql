-- Phase 0 verification fixtures for entity_track_history — NOT
-- Kafka-sourced data. These exist so Phase 0 can prove the WFS layer's
-- BBOX/CQL filtering actually discriminates (not just "WFS responds")
-- before Phase 1's producer/consumer pipeline exists to generate real
-- rows. Six points, split 3/3 across a known test bbox (see
-- kafka/README.md's Phase 0 verification section for the exact query),
-- so a bbox or attribute filter that silently returns everything (or
-- nothing) is distinguishable from one that's actually filtering.
--
-- Fixed UUIDs (not gen_random_uuid()) so this file's output is
-- deterministic across re-runs on a fresh volume and doesn't need
-- pgcrypto. Safe to TRUNCATE this table once Phase 1's real ingestion
-- pipeline is producing data you'd rather see instead.
--
-- All six sit inside AO_BOUNDS (server/src/aoBounds.ts): west -6.05,
-- east -5.15, south 35.75, north 36.25. The test bbox used for
-- verification is the western half: -6.05,35.75,-5.6,36.25.
INSERT INTO entity_track_history (event_id, entity_id, entity_kind, layer_id, affiliation, speed_kn, event_time, geom, attrs) VALUES
  -- Inside the test bbox (west half, lng < -5.6)
  ('00000000-0000-4000-8000-000000000001', 'FIXTURE-VESSEL-001', 'vessel',       'history-vessel-tracks', 'NEU', 12.5, '2026-08-20T08:00:00Z', ST_SetSRID(ST_MakePoint(-5.95, 35.85), 4326), '{"name":"MV KESTREL","course":184.2}'),
  ('00000000-0000-4000-8000-000000000002', 'FIXTURE-VESSEL-002', 'vessel',       'history-vessel-tracks', 'HOS', 18.0, '2026-08-20T09:00:00Z', ST_SetSRID(ST_MakePoint(-5.80, 36.05), 4326), '{"name":"MV OSPREY","course":92.5}'),
  ('00000000-0000-4000-8000-000000000003', 'FIXTURE-AIRCRAFT-001', 'aircraft',   'history-vessel-tracks', 'FRD', 220.0,'2026-08-20T10:00:00Z', ST_SetSRID(ST_MakePoint(-5.90, 36.15), 4326), '{"callsign":"REACH31","altFt":18000}'),
  -- Outside the test bbox (east half, lng > -5.6) — still inside AO_BOUNDS
  ('00000000-0000-4000-8000-000000000004', 'FIXTURE-VESSEL-003', 'vessel',       'history-vessel-tracks', 'NEU', 9.0,  '2026-08-20T08:30:00Z', ST_SetSRID(ST_MakePoint(-5.30, 35.90), 4326), '{"name":"MV LINNET","course":271.0}'),
  ('00000000-0000-4000-8000-000000000005', 'FIXTURE-VESSEL-004', 'vessel',       'history-vessel-tracks', 'HOS', 22.0, '2026-08-20T09:30:00Z', ST_SetSRID(ST_MakePoint(-5.25, 36.10), 4326), '{"name":"MV TERCEL","course":15.5}'),
  ('00000000-0000-4000-8000-000000000006', 'FIXTURE-SENSOR-001', 'sensor_track', 'history-vessel-tracks', 'FRD', NULL, '2026-08-20T10:30:00Z', ST_SetSRID(ST_MakePoint(-5.20, 35.95), 4326), '{"platform":"MQ-9"}');
