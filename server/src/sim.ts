import { update } from './store.js';
import { clamp, sensorName } from './helpers.js';
import type { LogEntry, State, Target } from './types.js';

// Ported 1:1 from `tick()` in Meridian Fires C2.dc.html (lines ~813-846).
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
        const rad = ((u.course - 90) * Math.PI) / 180;
        u.x = clamp(u.x + Math.cos(rad) * 0.1 * (u.speed / 30), 5, 95);
        u.y = clamp(u.y + Math.sin(rad) * 0.1 * (u.speed / 30), 6, 94);
      }
      u.decay = u.decay + 1;
      if (u.custody && u.custody !== '—' && u.decay > 18 + (u.id.charCodeAt(4) % 9)) {
        u.decay = 2 + (nt % 4);
      }
      u.trkQ = clamp(u.trkQ + (Math.sin(nt / 3 + u.x) * 1.4 | 0), 20, 99);
      if (u.engagedAt != null && nt - u.engagedAt >= 6 && u.stage === 3) {
        u.stage = 4;
        u.status = 'NEUTRALIZED';
        u.engagedAt = null;
        u.bda = 'DESTROYED · BDA PENDING CONFIRM';
        u.trkQ = 0;
        const entry: LogEntry = { t: nt, tag: 'BDA', text: `${u.name} — weapons impact, assessed DESTROYED. BDA pending.`, tag2: 'bda' };
        log = [entry, ...log];
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
