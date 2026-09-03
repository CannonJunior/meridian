import { update } from './store.js';
import { AO_BOUNDS } from './aoBounds.js';
import { clamp, destinationPoint, SIM_MINUTES_PER_TICK, sensorName } from './helpers.js';
import { publishNotification } from './notifications.js';
import type { LogEntry, State, Target } from './types.js';

// Ported 1:1 from `tick()` in Meridian Fires C2.dc.html (lines ~813-846),
// with the position update rewritten: the original moved an abstract x/y
// grid coordinate by an arbitrary fraction of `speed` with no physical
// meaning. This moves a real lng/lat by a real geodesic step — course as a
// true bearing, speed in knots, advanced through SIM_MINUTES_PER_TICK of
// simulated time per real-second tick (see helpers.ts).
export function tick(): void {
  update((s: State): State => {
    const nt = s.t + 1;
    let log = s.log;

    const targets: Target[] = s.targets.map((t) => {
      // Terminal — neither block below can ever apply once stage hits 4
      // (the movement/decay/trkQ block is gated on stage<4, the BDA
      // transition requires stage===3), so skip the clone+write entirely.
      if (t.stage >= 4) return t;
      const u: Target = { ...t };
      if (u.speed > 0) {
        const distanceNm = (u.speed * SIM_MINUTES_PER_TICK) / 60;
        const dest = destinationPoint(u.lng, u.lat, u.course, distanceNm);
        // Keep targets inside the AO with a small margin, same rationale
        // as the original grid's clamp(x, 5, 95) — a target that reaches
        // the edge holds there rather than sailing off the map.
        const margin = 0.02;
        u.lng = Math.min(AO_BOUNDS.east - margin, Math.max(AO_BOUNDS.west + margin, dest.lng));
        u.lat = Math.min(AO_BOUNDS.north - margin, Math.max(AO_BOUNDS.south + margin, dest.lat));
      }
      if (u.altFt != null) {
        // Minimal climb/cruise/descend cycle for the one airborne target
        // that has an altFt today (KITE) — deterministic on `nt`, the same
        // style of periodic nudge decay/trkQ already use, rather than new
        // per-target state. 60-tick cycle: climb, cruise, descend, cruise,
        // each quarter, at a realistic ~2,000 ft/min rate.
        const phase = nt % 60;
        u.vsFtMin = phase < 15 ? 2000 : phase < 30 ? 0 : phase < 45 ? -2000 : 0;
        if (u.vsFtMin !== 0) {
          u.altFt = Math.round(u.altFt + u.vsFtMin * SIM_MINUTES_PER_TICK);
        }
      }
      u.decay = u.decay + 1;
      if (u.custody && u.custody !== '—' && u.decay > 18 + (u.id.charCodeAt(4) % 9)) {
        u.decay = 2 + (nt % 4);
      }
      u.trkQ = clamp(u.trkQ + (Math.sin(nt / 3 + u.lng) * 1.4 | 0), 20, 99);
      if (u.engagedAt != null && nt - u.engagedAt >= 6 && u.stage === 3) {
        u.stage = 4;
        u.status = 'NEUTRALIZED';
        u.engagedAt = null;
        u.bda = 'DESTROYED · BDA PENDING CONFIRM';
        u.trkQ = 0;
        const entry: LogEntry = { t: nt, tag: 'BDA', text: `${u.name} — weapons impact, assessed DESTROYED. BDA pending.`, tag2: 'bda' };
        log = [entry, ...log];
        // v1's only real notification producer (see the notification
        // system design plan §2) — deliberately narrow: only a genuine
        // real server-side event, not the still-client-only
        // PendingAction/approval workflow. broadcast scope since there's
        // no per-user targeting concept this maps to yet (every connected
        // operator watches the same shared tactical picture).
        publishNotification({ scope: 'broadcast', type: 'bda-complete', priority: 'critical', title: `${u.name} — BDA pending`, body: entry.text, payload: { targetId: u.id } });
      }
      return u;
    });

    if (nt % 8 === 0) {
      const tracked = targets.filter((x) => x.stage < 4 && x.aff === 'HOS');
      if (tracked.length) {
        const r = tracked[nt % tracked.length];
        const entry: LogEntry = { t: nt, tag: 'TRK', text: `${r.name} track updated — ${sensorName(s, r.custody)}, TQ ${r.trkQ}.`, tag2: 'trk' };
        log = [entry, ...log];
      }
    }

    if (log.length > 60) log = log.slice(0, 60);
    return { ...s, t: nt, targets, log };
  });
}
