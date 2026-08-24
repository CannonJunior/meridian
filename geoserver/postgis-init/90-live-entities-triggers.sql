-- Postgres LISTEN/NOTIFY bridge for the live tactical picture, added on
-- top of 80-live-entities.sql's schema. This is what makes GeoServer's
-- WFS-T write path (confirmed working out of the box against this
-- workspace's default "COMPLETE" WFS service level — no GeoServer config
-- needed) actually round-trip: an edit made through GeoServer (or any
-- other client writing to these tables directly) fires a trigger, which
-- notifies server/src's dedicated LISTEN connection (see
-- server/src/liveSync.ts), which re-reads the changed row and merges it
-- into the live in-memory state, broadcasting it to connected WebSocket
-- clients over the same channel the sim tick already uses.
--
-- The payload is intentionally tiny (table + operation + id, not the full
-- row) — well under NOTIFY's 8000-byte payload limit regardless of row
-- size, and it means the listener always re-reads the current committed
-- row rather than trusting a payload that could be stale by the time it's
-- processed.
--
-- effectors has no trigger: it's not published as a WFS feature type (no
-- geometry column — see 80-live-entities.sql / provision.sh), so it's not
-- externally writable via WFS-T in the first place.

CREATE OR REPLACE FUNCTION meridian_notify_live_change() RETURNS trigger AS $$
DECLARE
  changed_id TEXT;
BEGIN
  changed_id := COALESCE(NEW.id, OLD.id);
  PERFORM pg_notify('meridian_live_change', json_build_object('table', TG_TABLE_NAME, 'op', TG_OP, 'id', changed_id)::text);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS targets_notify_live_change ON targets;
CREATE TRIGGER targets_notify_live_change AFTER INSERT OR UPDATE OR DELETE ON targets
  FOR EACH ROW EXECUTE FUNCTION meridian_notify_live_change();

DROP TRIGGER IF EXISTS sensors_notify_live_change ON sensors;
CREATE TRIGGER sensors_notify_live_change AFTER INSERT OR UPDATE OR DELETE ON sensors
  FOR EACH ROW EXECUTE FUNCTION meridian_notify_live_change();

DROP TRIGGER IF EXISTS friendly_units_notify_live_change ON friendly_units;
CREATE TRIGGER friendly_units_notify_live_change AFTER INSERT OR UPDATE OR DELETE ON friendly_units
  FOR EACH ROW EXECUTE FUNCTION meridian_notify_live_change();

DROP TRIGGER IF EXISTS nais_notify_live_change ON nais;
CREATE TRIGGER nais_notify_live_change AFTER INSERT OR UPDATE OR DELETE ON nais
  FOR EACH ROW EXECUTE FUNCTION meridian_notify_live_change();
