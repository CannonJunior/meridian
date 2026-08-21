import { update } from './store.js';
import { effName, isEngageReady, STAGES } from './helpers.js';
import type { Approvals, LogEntry, State, Target, View } from './types.js';

export function selectTarget(id: string): void {
  update((s) => (s.targets.some((t) => t.id === id) ? { ...s, selectedId: id } : s));
}

export function setView(view: View): void {
  update((s) => ({ ...s, view }));
}

export function cycleRoe(): void {
  update((s) => ({ ...s, roeIdx: (s.roeIdx + 1) % 3 }));
}

export function retaskSensor(sensorId: string): void {
  update((s: State): State => {
    const sel = s.targets.find((t) => t.id === s.selectedId);
    const cs = s.sensors.find((x) => x.id === sensorId);
    if (!cs) return s;
    const sensors = s.sensors.map((x) =>
      x.id === sensorId
        ? { ...x, tasking: sel ? `${sel.id.slice(1)} · ${sel.name}` : x.tasking, status: x.status === 'DEGRADED' ? x.status : ('TASKED' as const) }
        : x,
    );
    const targets = s.targets.map((t) => (t.id === s.selectedId ? { ...t, custody: sensorId, decay: 1 } : t));
    const entry: LogEntry = { t: s.t, tag: 'SYS', text: `${cs.callsign} retasked → ${sel ? sel.name : 'AO'}. Custody refreshed.`, tag2: 'sys' };
    return { ...s, sensors, targets, log: [entry, ...s.log] };
  });
}

export function assignEffector(effectorId: string): void {
  update((s: State): State => {
    const eff = s.effectors.find((e) => e.id === effectorId);
    if (!eff) return s;
    let nm = '';
    const targets = s.targets.map((t) => {
      if (t.id !== s.selectedId) return t;
      nm = t.name;
      return { ...t, effector: effectorId };
    });
    if (!nm) return s;
    const entry: LogEntry = { t: s.t, tag: 'PAIR', text: `${nm} paired → ${eff.callsign} (${eff.platform}) ${eff.weapon}.`, tag2: 'pair' };
    return { ...s, targets, log: [entry, ...s.log] };
  });
}

const APPR_LABEL: Record<keyof Approvals, string> = {
  pid: 'Positive ID',
  jag: 'ROE/JAG review',
  strike: 'Strike Cell concur',
  tea: 'Target Engagement Authority',
};

// `id` lets a caller target a specific track explicitly rather than
// whatever's currently selected — needed once an approval can be granted
// well after submission (see the pending-action/JTCB adjudication flow),
// by which time the user may have moved on to a different track.
export function toggleAppr(key: keyof Approvals, id?: string): void {
  update((s: State): State => {
    const targetId = id ?? s.selectedId;
    let nm = '';
    let nowOn = false;
    const targets = s.targets.map((t) => {
      if (t.id !== targetId) return t;
      nm = t.name;
      nowOn = !t.appr[key];
      return { ...t, appr: { ...t.appr, [key]: nowOn } };
    });
    if (!nm) return s;
    const entry: LogEntry = { t: s.t, tag: 'SYS', text: `${nm} — ${APPR_LABEL[key]} ${nowOn ? 'granted' : 'withdrawn'}.`, tag2: 'sys' };
    return { ...s, targets, log: [entry, ...s.log] };
  });
}

export function engage(): void {
  update((s: State): State => {
    const sel = s.targets.find((t) => t.id === s.selectedId);
    if (!isEngageReady(sel)) return s;
    let nm = '';
    let eff = '';
    const targets = s.targets.map((t) => {
      if (t.id !== s.selectedId) return t;
      nm = t.name;
      eff = effName(s, t.effector);
      return { ...t, engagedAt: s.t, status: 'ENGAGED — WPNS RELEASED' };
    });
    const entry: LogEntry = { t: s.t, tag: 'FIRE', text: `${nm} — WEAPONS RELEASED via ${eff}. Time of flight running.`, tag2: 'fire' };
    return { ...s, targets, log: [entry, ...s.log] };
  });
}

// Assigns (or clears, with pri=null) a target's HPTL priority rank —
// currently only reachable via an approved target nomination (see the
// pending-action/JTWG flow client-side); there's no direct UI control for
// it, matching how targeting doctrine treats prioritization as an outcome
// of vetting, not a value someone just types in.
export function setPriority(id: string, pri: number | null): void {
  update((s: State): State => {
    let nm = '';
    const targets = s.targets.map((t) => {
      if (t.id !== id) return t;
      nm = t.name;
      return { ...t, pri };
    });
    if (!nm) return s;
    const entry: LogEntry = { t: s.t, tag: 'SYS', text: pri != null ? `${nm} — prioritized #${pri} (JTWG nomination approved).` : `${nm} — priority rank cleared.`, tag2: 'sys' };
    return { ...s, targets, log: [entry, ...s.log] };
  });
}

export function setStage(id: string, stageIdx: number): void {
  if (id == null || stageIdx < 0 || stageIdx > 4) return;
  update((s: State): State => {
    let nm = '';
    const targets = s.targets.map((t) => {
      if (t.id !== id) return t;
      nm = t.name;
      return { ...t, stage: stageIdx };
    });
    if (!nm) return s;
    const entry: LogEntry = { t: s.t, tag: 'SYS', text: `${nm} → ${STAGES[stageIdx].key} (board move).`, tag2: 'sys' };
    return { ...s, targets, log: [entry, ...s.log], selectedId: id };
  });
}

function shiftStage(delta: number): void {
  update((s: State): State => {
    let logEntry: LogEntry | null = null;
    const targets: Target[] = s.targets.map((t) => {
      if (t.id !== s.selectedId) return t;
      const ns = Math.max(0, Math.min(4, t.stage + delta));
      if (ns !== t.stage) logEntry = { t: s.t, tag: 'SYS', text: `${t.name} moved to ${STAGES[ns].key}.`, tag2: 'sys' };
      return { ...t, stage: ns };
    });
    const log = logEntry ? [logEntry, ...s.log] : s.log;
    return { ...s, targets, log };
  });
}

export function advanceStage(): void {
  shiftStage(1);
}

export function retreatStage(): void {
  shiftStage(-1);
}
