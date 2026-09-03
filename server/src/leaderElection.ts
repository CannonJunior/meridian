// Elected-leader HA (SERVER_HA_ENABLED) — NOT currently wired into
// server/src/index.ts. This module is fully built (advisory-lock
// acquisition, epoch minting, heartbeat-based failure detection) but
// index.ts today never imports it, never reads SERVER_HA_ENABLED, and
// never calls startLeaderElection/onBecomeLeader/onLoseLeadership — so
// this file has no callers anywhere in the app and no code path is gated
// on leadership. The intended shape, once wired, is described below and
// in the doc comments on liveSync.ts's stopLiveSync and types.ts's
// LeaderEnvelope — the counterpart producer those depend on
// (leaderFanout.ts) also doesn't exist yet. Remaining work to make this
// real: have index.ts call startLeaderElection() behind the flag, gate
// sim tick/action application/persistence/liveSync/the live-domain Kafka
// producer on isLeader(), and write leaderFanout.ts. Until then, treat
// every comment below describing "the leader" as a design intent, not a
// currently-running behavior.
//
// Uses a Postgres advisory lock (pg_try_advisory_lock), held on a
// dedicated, non-pooled pg.Client — never db.ts's `pool`, whose connections
// can be silently recycled out from under a session-scoped lock. This
// mirrors liveSync.ts's own "dedicated long-lived connection with a
// reconnect loop" idiom, the established pattern in this codebase for
// exactly this kind of connection.
//
// Session-scoped advisory locks auto-release when their holding connection
// drops, which is a correct backstop for failover but not a *fast* one — OS
// TCP keepalive defaults can be hours. Detection latency here is instead
// bounded by an active heartbeat (a plain query, raced against a timeout)
// run on the same connection while leading; any failure is treated as an
// immediate, unilateral loss of leadership, not something to wait out.
//
// Every acquisition mints a monotonic epoch from server_leader_epoch_seq
// (geoserver/postgis-init/120-leader-epoch.sql) — the fencing token
// leaderFanout.ts stamps on everything it publishes, so a "zombie leader"
// (one that keeps producing briefly after actually losing the lock — a GC
// pause, a partial network partition) can never have its stale messages
// accepted by a follower that has already seen a newer leader's epoch.
import os from 'node:os';
import pg from 'pg';
import { pgConnectionConfig } from './db.js';

// Arbitrary fixed key — nothing else in this schema uses advisory locks, so
// any constant works as long as every replica agrees on it.
const ADVISORY_LOCK_KEY = 847_362_910;

const POLL_INTERVAL_MS = 3000;
const HEARTBEAT_INTERVAL_MS = 2000;
const HEARTBEAT_TIMEOUT_MS = 5000;
const RECONNECT_DELAY_MS = 3000;

// The heartbeat above bounds how fast *this* replica notices its own
// connection has gone bad while leading. It does nothing for the opposite
// case — a *follower's* view of a leader that hard-crashes (kill -9, OOM,
// a force-deleted pod) with no chance to run stopLeaderElection()'s
// graceful pg_advisory_unlock. That connection just goes silent; Postgres
// only releases its advisory lock once it notices the socket is dead, which
// without these being set defaults to the OS's own TCP keepalive timing —
// on Linux, out of the box, that's 2 hours idle before the first probe.
// Confirmed directly: with tcp_keepalives_idle at its default 0
// ("use system default"), a kill -9'd leader's advisory lock was still
// held, unreleased, 8+ seconds later against this repo's dev Postgres.
// Setting these session-level (SET, right after connect — they're regular
// runtime GUCs, not connection-startup-only) makes Postgres itself probe
// this specific backend's socket aggressively: idle 5s, then a probe every
// 2s, giving up after 2 missed probes — worst case ~9s to notice a truly
// dead leader connection, independent of whatever the server's global
// defaults are.
const TCP_KEEPALIVES_IDLE_SEC = 5;
const TCP_KEEPALIVES_INTERVAL_SEC = 2;
const TCP_KEEPALIVES_COUNT = 2;

// Identifies this replica in its own follower-side Kafka consumer group
// names (leaderFanout.ts) — must be unique per running instance. Falls back
// to os.hostname() (the pod name in k8s) rather than requiring every
// deployment to set it explicitly; only needs overriding to run more than
// one replica by hand on a single machine (e.g. two local `npm run dev`
// processes), where they'd otherwise collide on hostname.
export const REPLICA_ID = process.env.REPLICA_ID ?? os.hostname();

type BecomeLeaderListener = (epoch: number) => void;
type LoseLeadershipListener = () => void;

const becomeLeaderListeners = new Set<BecomeLeaderListener>();
const loseLeadershipListeners = new Set<LoseLeadershipListener>();

export function onBecomeLeader(fn: BecomeLeaderListener): () => void {
  becomeLeaderListeners.add(fn);
  return () => becomeLeaderListeners.delete(fn);
}
export function onLoseLeadership(fn: LoseLeadershipListener): () => void {
  loseLeadershipListeners.add(fn);
  return () => loseLeadershipListeners.delete(fn);
}

let leader = false;
let currentEpoch: number | null = null;
export function isLeader(): boolean {
  return leader;
}
export function getCurrentEpoch(): number | null {
  return currentEpoch;
}

// Incremented on every new connection attempt (and on stop) so a stale
// callback from a superseded connection — a query that was already in
// flight when that connection got torn down — can recognize it no longer
// speaks for the current one and no-op, instead of acting on its behalf.
let generation = 0;
let client: pg.Client | null = null;
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
let stopped = true;

function clearTimers(): void {
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
  if (heartbeatTimer) {
    clearTimeout(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function becomeLeader(epoch: number): void {
  leader = true;
  currentEpoch = epoch;
  console.log(`[meridian] leader-election: acquired leadership, epoch=${epoch}`);
  for (const fn of becomeLeaderListeners) fn(epoch);
}

function loseLeadership(reason: string): void {
  if (!leader) return;
  console.error(`[meridian] leader-election: lost leadership (${reason})`);
  leader = false;
  currentEpoch = null;
  for (const fn of loseLeadershipListeners) fn();
}

// Called whenever the current connection stops being usable — a query
// error, a failed heartbeat, or the client's own 'error' event. Tears down
// bookkeeping for `gen` and, unless this module has been intentionally
// stopped, schedules a fresh connection attempt.
function handleConnectionLost(gen: number, reason: string): void {
  if (gen !== generation) return;
  clearTimers();
  loseLeadership(reason);
  const dead = client;
  client = null;
  if (dead) dead.end().catch(() => {});
  if (!stopped) setTimeout(connect, RECONNECT_DELAY_MS);
}

async function runHeartbeat(gen: number): Promise<void> {
  if (gen !== generation || !client) return;
  const c = client;
  try {
    await Promise.race([
      c.query('SELECT 1'),
      new Promise((_resolve, reject) => setTimeout(() => reject(new Error('heartbeat timed out')), HEARTBEAT_TIMEOUT_MS)),
    ]);
  } catch (err) {
    handleConnectionLost(gen, `heartbeat failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function scheduleHeartbeat(gen: number): void {
  heartbeatTimer = setTimeout(() => {
    runHeartbeat(gen)
      .catch((err) => console.error('[meridian] leader-election: heartbeat error:', err))
      .finally(() => {
        if (gen === generation && leader) scheduleHeartbeat(gen);
      });
  }, HEARTBEAT_INTERVAL_MS);
}

async function pollForLock(gen: number): Promise<void> {
  if (gen !== generation || !client || leader) return;
  const c = client;
  try {
    const result = await c.query<{ locked: boolean }>('SELECT pg_try_advisory_lock($1) AS locked', [ADVISORY_LOCK_KEY]);
    if (gen !== generation || !result.rows[0]?.locked) return;
    const epochResult = await c.query<{ epoch: string }>(`SELECT nextval('server_leader_epoch_seq') AS epoch`);
    if (gen !== generation) return;
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
    becomeLeader(Number(epochResult.rows[0].epoch));
    scheduleHeartbeat(gen);
  } catch (err) {
    handleConnectionLost(gen, `lock poll failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function schedulePoll(gen: number): void {
  pollTimer = setTimeout(() => {
    pollForLock(gen)
      .catch((err) => console.error('[meridian] leader-election: poll error:', err))
      .finally(() => {
        if (gen === generation && !leader) schedulePoll(gen);
      });
  }, POLL_INTERVAL_MS);
}

function connect(): void {
  if (stopped) return;
  const gen = ++generation;
  const c = new pg.Client(pgConnectionConfig());
  client = c;

  c.on('error', (err) => handleConnectionLost(gen, `connection error: ${err.message}`));

  c.connect()
    .then(() =>
      c.query(
        `SET tcp_keepalives_idle = ${TCP_KEEPALIVES_IDLE_SEC}; SET tcp_keepalives_interval = ${TCP_KEEPALIVES_INTERVAL_SEC}; SET tcp_keepalives_count = ${TCP_KEEPALIVES_COUNT};`,
      ),
    )
    .then(() => {
      if (gen !== generation) {
        c.end().catch(() => {});
        return;
      }
      console.log(`[meridian] leader-election: connected (replica ${REPLICA_ID}), polling for leadership`);
      // Don't wait a full POLL_INTERVAL_MS for the first attempt.
      pollForLock(gen)
        .catch((err) => console.error('[meridian] leader-election: poll error:', err))
        .finally(() => {
          if (gen === generation && !leader) schedulePoll(gen);
        });
    })
    .catch((err) => handleConnectionLost(gen, `connect failed: ${err instanceof Error ? err.message : String(err)}`));
}

export function startLeaderElection(): void {
  stopped = false;
  connect();
}

// Graceful path (SIGTERM) — explicitly releases the lock rather than
// relying solely on connection teardown to do it, so a clean shutdown
// doesn't leave the next leader waiting out this session's own
// already-scheduled heartbeat/poll timing.
export async function stopLeaderElection(): Promise<void> {
  stopped = true;
  generation++;
  clearTimers();
  const c = client;
  client = null;
  const wasLeader = leader;
  if (c) {
    if (wasLeader) {
      await c.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]).catch(() => {});
    }
    await c.end().catch(() => {});
  }
  loseLeadership('graceful stop');
}
