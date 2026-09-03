import { randomUUID } from 'node:crypto';
import { pool } from './db.js';

// UI notification system — see the design plan (literature review, plan,
// independent review, red team) this module implements. v1 scope is
// deliberately narrow: 'broadcast' | 'client' targeting only, no 'org'
// scope, because orgId today is a UI view-selector any connected browser
// can freely switch (ChatManager.tsx's org tabs), not a per-user identity —
// see ws.ts's hello handshake for the (self-declared, unauthenticated)
// clientId this module's 'client' scope targets.
export type NotificationScope = 'broadcast' | 'client';
export type NotificationPriority = 'critical' | 'normal' | 'info';

export interface NotificationEvent {
  id: string;
  scope: NotificationScope;
  targetId: string | null; // clientId for scope='client', null for 'broadcast'
  type: string;
  priority: NotificationPriority;
  title: string;
  body: string | null;
  payload: Record<string, unknown>;
  createdAt: string; // wall-clock ISO — deliberately not State.t, the sim tick
  count: number; // >1 when this event represents several coalesced occurrences
}

export interface PublishInput {
  scope: NotificationScope;
  targetId?: string | null;
  type: string;
  priority: NotificationPriority;
  title: string;
  body?: string | null;
  payload?: Record<string, unknown>;
}

const NOTIFICATION_TTL_HOURS = 24;

function rowToEvent(r: any): NotificationEvent {
  return {
    id: r.id,
    scope: r.scope,
    targetId: r.target_id,
    type: r.type,
    priority: r.priority,
    title: r.title,
    body: r.body,
    payload: r.payload ?? {},
    createdAt: r.created_at.toISOString(),
    count: 1,
  };
}

async function insertNotification(event: NotificationEvent): Promise<void> {
  await pool.query(
    `INSERT INTO notifications (id, scope, target_id, type, priority, title, body, payload, created_at, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::timestamptz, $9::timestamptz + make_interval(hours => $10))`,
    [event.id, event.scope, event.targetId, event.type, event.priority, event.title, event.body, JSON.stringify(event.payload), event.createdAt, NOTIFICATION_TTL_HOURS],
  );
}

// --- reconnect replay ------------------------------------------------------
//
// Two-tier: an in-process ring buffer serves the common case (a client that
// was disconnected briefly) with zero DB round-trip; Postgres is only
// consulted for gaps older than the ring buffer's own window. This is the
// red-team fix for the naive version of this feature — routing every
// reconnect's replay straight at Postgres means a synchronized mass
// reconnect (e.g. after a server restart) fires that many replay queries at
// once against the same connection pool sim.ts's persistTick already uses,
// which is exactly the kind of thundering herd that turns a routine restart
// into an apparent outage.
const RING_BUFFER_SIZE = 200;
const ring: NotificationEvent[] = [];

function pushToRing(event: NotificationEvent): void {
  ring.push(event);
  if (ring.length > RING_BUFFER_SIZE) ring.shift();
}

function matchesTarget(event: NotificationEvent, scope: NotificationScope | 'any', targetId: string | null): boolean {
  if (event.scope === 'broadcast') return true;
  if (scope !== 'any' && scope !== 'client') return false;
  return event.targetId === targetId;
}

const REPLAY_DB_LIMIT = 100;

// Called once per WS 'connection' whose client declared a lastSeenId (see
// ws.ts). Bounded on both tiers — the ring buffer is capped at
// RING_BUFFER_SIZE by construction, and the Postgres fallback is capped at
// REPLAY_DB_LIMIT rows — so a very-long-disconnected client gets "the most
// recent bounded window," not an unbounded backfill.
export async function replayNotificationsSince(targetId: string, sinceId: string | null): Promise<NotificationEvent[]> {
  // A first-ever connection (no lastSeenId at all) has nothing "missed" to
  // replay — this path is specifically for reconnect catch-up, not a
  // history browse (that's the separate, paginated Notification Center
  // query the UI uses for browsing, not this one).
  if (!sinceId) return [];

  const idx = ring.findIndex((e) => e.id === sinceId);
  if (idx !== -1) {
    return ring.slice(idx + 1).filter((e) => matchesTarget(e, 'any', targetId));
  }
  // sinceId is older than the ring's own window — bounded DB fallback. If
  // sinceId isn't found in the table either (expired/pruned, or a stale id
  // from a different environment/reset), the subquery returns NULL and
  // `created_at > NULL` is false for every row — an empty, safe result
  // rather than a guess at "everything."
  const r = await pool.query(
    `SELECT id, scope, target_id, type, priority, title, body, payload, created_at
       FROM notifications
      WHERE (scope = 'broadcast' OR (scope = 'client' AND target_id = $1))
        AND created_at > (SELECT created_at FROM notifications WHERE id = $2)
      ORDER BY created_at ASC
      LIMIT $3`,
    [targetId, sinceId, REPLAY_DB_LIMIT],
  );
  return r.rows.map(rowToEvent);
}

// --- batching/coalescing ----------------------------------------------------
//
// Lives inside publishNotification (not in ws.ts's delivery/broadcast path)
// so a future multi-instance fan-out swap (see the plan's fan-out seam)
// doesn't fragment "N similar events -> 1 delivered notification" into a
// per-replica count. Fixed max-wait, not a resetting debounce — a steady
// trickle of same-key events always flushes by (first event + BATCH_WINDOW_MS),
// never gets starved by new arrivals resetting the clock (a red-team finding
// against the draft's unspecified semantics).
const BATCH_WINDOW_MS = 3000;
// Caps the number of distinct (scope,targetId,type) keys buffering at once —
// without this, a burst of events across many distinct targetIds (a real
// wide event, or a bug) grows this Map and its timers unboundedly on the
// same event loop already running the 1Hz broadcast tick. Overflow delivers
// immediately instead of buffering, trading away batching for that one key
// rather than risking unbounded memory/timer growth.
const MAX_BATCH_KEYS = 500;

interface BatchEntry {
  event: NotificationEvent;
  timer: ReturnType<typeof setTimeout>;
}
const batches = new Map<string, BatchEntry>();

function batchKey(input: PublishInput): string {
  return `${input.scope}:${input.targetId ?? ''}:${input.type}`;
}

type Listener = (event: NotificationEvent) => void;
const listeners = new Set<Listener>();

// ws.ts registers here to know when a (possibly coalesced) notification is
// ready to deliver — kept as a plain listener set (same shape as store.ts's
// own subscribe/listeners) rather than notifications.ts importing ws.ts,
// which would create a circular module dependency.
export function onNotificationReady(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function flush(key: string): void {
  const entry = batches.get(key);
  if (!entry) return;
  batches.delete(key);
  pushToRing(entry.event);
  insertNotification(entry.event).catch((err) => console.error('[meridian] notifications: insert failed:', err));
  for (const fn of listeners) fn(entry.event);
}

// --- rate limiting -----------------------------------------------------------
//
// A token bucket independent of per-key batching: batching bounds "how many
// deliveries reach a client for one repeating event," this bounds "how many
// times any producer can call publishNotification at all." Guards against
// an upstream bug (e.g. a runaway log loop) turning into a DB-write/broadcast
// storm — fails safe (drop + log), not by blocking or queuing.
const RATE_LIMIT_CAPACITY = 50;
const RATE_LIMIT_REFILL_PER_SEC = 20;
let tokens = RATE_LIMIT_CAPACITY;
let lastRefill = Date.now();

function takeToken(): boolean {
  const now = Date.now();
  const elapsedSec = (now - lastRefill) / 1000;
  if (elapsedSec > 0) {
    tokens = Math.min(RATE_LIMIT_CAPACITY, tokens + elapsedSec * RATE_LIMIT_REFILL_PER_SEC);
    lastRefill = now;
  }
  if (tokens < 1) return false;
  tokens -= 1;
  return true;
}

// The single producer call site every future notification source (real
// server events only — see the plan's ⧉2, this does not fire from the
// still-client-only PendingAction/approval workflow) goes through. Owns
// batching (above) so the fan-out seam (a future Kafka-backed multi-instance
// swap) sits behind this function without touching call sites or breaking
// coalescing semantics.
export function publishNotification(input: PublishInput): void {
  if (!takeToken()) {
    console.error(`[meridian] notifications: rate limit exceeded, dropping "${input.type}"`);
    return;
  }

  const key = batchKey(input);
  const existing = batches.get(key);
  if (existing) {
    if (input.priority === 'critical') {
      // Critical bypasses batching entirely — flush whatever was pending
      // for this key first (so it isn't silently absorbed into a coalesced
      // non-critical delivery), then deliver this one immediately too.
      flush(key);
    } else {
      existing.event.count += 1;
      existing.event.title = input.title; // most-recent occurrence's title/body wins
      existing.event.body = input.body ?? existing.event.body;
      return; // timer already running from the first event in this window — not reset
    }
  }

  if (input.priority === 'critical') {
    deliverImmediately(input);
    return;
  }

  if (batches.size >= MAX_BATCH_KEYS) {
    // Cardinality cap hit — deliver this one immediately rather than risk
    // unbounded Map/timer growth for a key that would otherwise wait.
    deliverImmediately(input);
    return;
  }

  const event = toEvent(input);
  const timer = setTimeout(() => flush(key), BATCH_WINDOW_MS);
  batches.set(key, { event, timer });
}

function toEvent(input: PublishInput): NotificationEvent {
  return {
    id: randomUUID(),
    scope: input.scope,
    targetId: input.targetId ?? null,
    type: input.type,
    priority: input.priority,
    title: input.title,
    body: input.body ?? null,
    payload: input.payload ?? {},
    createdAt: new Date().toISOString(),
    count: 1,
  };
}

function deliverImmediately(input: PublishInput): void {
  const event = toEvent(input);
  pushToRing(event);
  insertNotification(event).catch((err) => console.error('[meridian] notifications: insert failed:', err));
  for (const fn of listeners) fn(event);
}

// RT-03-class safeguard (see db.ts's pruneAirTrackHistory/
// pruneRealtimeHistoryLayers doc comments) — same hourly-setInterval
// schedule in index.ts. expires_at is set at insert time (NOTIFICATION_TTL_HOURS
// from created_at), so this is a plain bounded DELETE, not a computed one.
export async function pruneNotifications(): Promise<number> {
  const result = await pool.query(`DELETE FROM notifications WHERE expires_at < now()`);
  return result.rowCount ?? 0;
}
