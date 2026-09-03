-- Backing store for the UI notification system (server/src/notifications.ts,
-- ws.ts's delivery/replay path). App-internal data, not geodata — unlike
-- every other table in this directory, nothing here is published through
-- GeoServer, so there's no read-only role/grant section and no companion
-- provision.sh step.
--
-- scope is deliberately 'broadcast' | 'client' only in v1, not 'org' — the
-- app's orgId today is a UI view-selector any single connected browser can
-- freely switch between (see ChatManager.tsx's org tabs), not a per-user
-- identity, so an org-targeted row here would have no reliable way to know
-- which connections currently represent that org. target_id is the
-- self-declared clientId (ws.ts's hello handshake) for scope='client', and
-- unused (NULL) for scope='broadcast'.
--
-- id is generated application-side (crypto.randomUUID() in
-- notifications.ts), the same convention entity_track_history's event_id
-- already uses (see 100-history.sql) — no pgcrypto/uuid-ossp extension
-- dependency.
--
-- expires_at is NOT NULL and always set at insert time (not defaulted) —
-- the prune job (db.ts's pruneNotifications, called on the same
-- hourly schedule as pruneAirTrackHistory/pruneRealtimeHistoryLayers in
-- index.ts) deletes past it. Without this the table grows unbounded, the
-- same RT-03-class failure mode those two prune jobs already exist to
-- prevent for entity_track_history.
DROP TABLE IF EXISTS notifications;
CREATE TABLE notifications (
  id          UUID PRIMARY KEY,
  scope       TEXT NOT NULL CHECK (scope IN ('broadcast', 'client')),
  target_id   TEXT,
  type        TEXT NOT NULL,
  priority    TEXT NOT NULL CHECK (priority IN ('critical', 'normal', 'info')),
  title       TEXT NOT NULL,
  body        TEXT,
  payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL
);

-- Serves the reconnect-replay query (ws.ts, on 'connection'): "notifications
-- for this scope/target since the client's last-seen id/time," newest first.
CREATE INDEX notifications_scope_target_created_idx ON notifications (scope, target_id, created_at DESC);
-- Serves the prune job's DELETE WHERE expires_at < now().
CREATE INDEX notifications_expires_idx ON notifications (expires_at);
