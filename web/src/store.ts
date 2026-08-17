import { create } from 'zustand';
import { sendAction } from './wsClient';
import type { Approvals, CardKind, State, View } from './types';

interface UiState {
  connected: boolean;
  cardKind: CardKind;
  cardId: string | null;
  cardTab: number;
  cardX: number;
  cardY: number;
  basemapId: string;
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

  setFromServer: (s) => set(s),
  setConnected: (v) => set({ connected: v }),

  selectTarget: (id) => {
    set({ selectedId: id });
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
}));
