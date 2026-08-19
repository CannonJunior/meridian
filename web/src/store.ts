import { create } from 'zustand';
import { sendAction } from './wsClient';
import type { Approvals, CardKind, State, View } from './types';
import { findOobNode } from './oobSelectors';
import { deepEqual } from './deepEqual';
import { CONTEXT_LAYERS } from './assets/contextLayers';
import type { PortFeature } from './portFeature';
import type { AirfieldFeature } from './airfieldFeature';

export type Manager = 'context' | 'isr' | 'oob';

interface UiState {
  connected: boolean;
  cardKind: CardKind;
  cardId: string | null;
  cardTab: number;
  cardX: number;
  cardY: number;
  basemapId: string;
  activeManager: Manager;
  oobSelectedId: string | null;
  contextLayerVisibility: Record<string, boolean>;
  ports: Record<string, PortFeature>;
  airfields: Record<string, AirfieldFeature>;
}

interface Actions {
  setFromServer: (s: State) => void;
  setConnected: (v: boolean) => void;

  selectTarget: (id: string) => void;
  setView: (v: View) => void;
  cycleRoe: () => void;
  retaskSensor: (sensorId: string) => void;
  assignEffector: (effectorId: string) => void;
  toggleAppr: (key: keyof Approvals) => void;
  engage: () => void;
  setStage: (id: string, stageIdx: number) => void;
  advanceStage: () => void;
  retreatStage: () => void;

  openEntity: (kind: CardKind, id: string) => void;
  openCard: (id: string) => void;
  closeCard: () => void;
  setCardTab: (i: number) => void;
  moveCardTo: (x: number, y: number) => void;
  setBasemap: (id: string) => void;
  setActiveManager: (m: Manager) => void;
  selectOob: (id: string) => void;
  toggleContextLayer: (id: string) => void;
  openPort: (feature: PortFeature) => void;
  openAirfield: (feature: AirfieldFeature) => void;
}

type Store = State & UiState & Actions;

const EMPTY_STATE: State = {
  t: 0,
  selectedId: 'T2202',
  view: 'MAP',
  roeIdx: 1,
  targets: [],
  sensors: [],
  effectors: [],
  units: [],
  nais: [],
  log: [],
};

export const useStore = create<Store>((set, get) => ({
  ...EMPTY_STATE,
  connected: false,
  cardKind: 'target',
  cardId: null,
  cardTab: 0,
  cardX: 330,
  cardY: 96,
  basemapId: 'tactical',
  activeManager: 'isr',
  oobSelectedId: null,
  contextLayerVisibility: Object.fromEntries(CONTEXT_LAYERS.map((l) => [l.id, l.defaultVisible])),
  ports: {},
  airfields: {},

  setFromServer: (s) =>
    set((prev) => {
      const patch: Partial<State> = {};
      for (const key of Object.keys(s) as (keyof State)[]) {
        if (!deepEqual(prev[key], s[key])) {
          (patch as Record<string, unknown>)[key] = s[key];
        }
      }
      return patch;
    }),
  setConnected: (v) => set({ connected: v }),

  selectTarget: (id) => {
    set({ selectedId: id, cardKind: 'target', cardId: id, cardTab: 0 });
    sendAction('selectTarget', { id });
  },
  setView: (view) => {
    set({ view });
    sendAction('setView', { view });
  },
  cycleRoe: () => sendAction('cycleRoe'),
  retaskSensor: (sensorId) => sendAction('retaskSensor', { sensorId }),
  assignEffector: (effectorId) => sendAction('assignEffector', { effectorId }),
  toggleAppr: (key) => sendAction('toggleAppr', { key }),
  engage: () => sendAction('engage'),
  setStage: (id, stageIdx) => {
    set({ selectedId: id });
    sendAction('setStage', { id, stageIdx });
  },
  advanceStage: () => sendAction('advanceStage'),
  retreatStage: () => sendAction('retreatStage'),

  openEntity: (kind, id) => {
    set({ cardKind: kind, cardId: id, cardTab: 0 });
    if (kind === 'target') get().selectTarget(id);
  },
  openCard: (id) => get().openEntity('target', id),
  closeCard: () => set({ cardId: null }),
  setCardTab: (i) => set({ cardTab: i }),
  moveCardTo: (x, y) => set({ cardX: Math.max(0, x), cardY: Math.max(0, y) }),
  setBasemap: (id) => set({ basemapId: id }),
  setActiveManager: (m) => set({ activeManager: m }),
  selectOob: (id) => {
    const node = findOobNode(id);
    set({
      oobSelectedId: id,
      activeManager: 'oob',
      ...(node?.entityType === 'object' ? { cardKind: 'oobObject' as const, cardId: id, cardTab: 0 } : {}),
    });
  },
  toggleContextLayer: (id) => set((prev) => ({ contextLayerVisibility: { ...prev.contextLayerVisibility, [id]: !prev.contextLayerVisibility[id] } })),
  openPort: (feature) => set((prev) => ({ ports: { ...prev.ports, [feature.id]: feature }, cardKind: 'port', cardId: feature.id, cardTab: 0 })),
  openAirfield: (feature) => set((prev) => ({ airfields: { ...prev.airfields, [feature.id]: feature }, cardKind: 'airfield', cardId: feature.id, cardTab: 0 })),
}));
