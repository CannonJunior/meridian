import { create } from 'zustand';
import type { FeatureCollection, Polygon } from 'geojson';
import { sendAction } from './wsClient';
import type { Approvals, CardKind, State, Target, TargetListId, View } from './types';
import { findOobNode } from './oobSelectors';
import { deepEqual } from './deepEqual';
import { CONTEXT_LAYERS } from './assets/contextLayers';
import { RIGHT_RAIL_MAX_WIDTH, RIGHT_RAIL_MIN_WIDTH } from './layout';
import { listsForTarget, TARGET_LISTS } from './assets/targetLists';
import type { TargetListTransition } from './assets/targetLists';
import { ACTION_ROUTING, entityForRole, ORGANIZATIONS, orgById, roleLabel } from './assets/staff';
import { fmtLogTime } from './selectors';
import { TUTORIALS } from './assets/tutorials';
import type { PortFeature } from './portFeature';
import type { AirfieldFeature } from './airfieldFeature';
import type { MapMode } from './cesium3d';

export type Manager = 'context' | 'isr' | 'oob' | 'style' | 'lists' | 'chat' | 'kb' | 'draw';
export type LegendMode = 'AFFILIATION' | 'OOB';

// Layer/object association scope for the drawing tool (DrawingToolManager.tsx)
// — the three things in this app with a real searchable name index a drawn
// shape can be pinned to.
export type DrawLayerId = 'maritime-ports' | 'airfields' | 'oob';
export type DrawToolPhase = 'upload' | 'control-points' | 'polygon' | 'associate';

// One correspondence between a pixel on the uploaded reference image and a
// real lng/lat on the live map — imageWarp.ts's computeAffineTransform needs
// >=3 of these to register the image onto the map.
export interface DrawControlPoint {
  imageX: number;
  imageY: number;
  lng: number;
  lat: number;
}

export interface DrawToolState {
  phase: DrawToolPhase;
  imageDataUrl: string | null;
  imageNaturalWidth: number;
  imageNaturalHeight: number;
  controlPoints: DrawControlPoint[];
  // An image-space click awaiting its matching map click — set by
  // addImageControlPoint, consumed (and cleared) by addMapControlPoint.
  pendingImagePoint: { x: number; y: number } | null;
  // The finished trace, in lng/lat — null while still being drawn.
  polygonLngLat: [number, number][] | null;
}

const INITIAL_DRAW_TOOL: DrawToolState = {
  phase: 'upload',
  imageDataUrl: null,
  imageNaturalWidth: 0,
  imageNaturalHeight: 0,
  controlPoints: [],
  pendingImagePoint: null,
  polygonLngLat: null,
};

export interface OobStyle {
  radarColor: string;
  weaponColor: string;
}

// Click-to-dismiss notifications, stacked bottom-right in the center panel.
// Currently only produced by target-list transitions (see setFromServer),
// one per list a target newly joins.
export interface Toast {
  id: string;
  text: string;
  accent: string;
}

// Gaps 1/3/4/6, generalized: an action a user takes is no longer applied
// instantly — it's submitted to an organization (assets/staff.ts), sits
// pending until that org's cadence elapses, and only then is it adjudicated
// (by a computer-controlled seat-holder for now, structured so a real
// second user could occupy that seat instead) and applied — or rejected,
// with a stated rationale so the "why" is never a black box. Every
// ACTION_ROUTING entry marked `wired: true` goes through this pipeline;
// see ADJUDICATORS below for what each one actually checks.
export type PendingActionStatus = 'pending' | 'approved' | 'rejected';

export interface PendingAction {
  id: string;
  kind: string; // e.g. 'toggleAppr:strike', 'nominateTarget'
  targetId: string;
  orgId: string;
  submittedBy: string; // StaffEntity id
  submittedAt: number; // DTG — simulation tick (State.t) at submission
  adjudicationDueAt: number; // DTG — simulation tick the org is expected to rule by
  status: PendingActionStatus;
  resolvedAt?: number;
  resolvedBy?: string; // StaffEntity id
  rationale?: string;
}

interface AdjudicationResult {
  approve: boolean;
  reasons: string[];
}

// Gap 4: a message thread with an organization — optionally tagged to a
// specific target's pending action, since "discuss this request" and
// "ask the board something general" are both real needs. The NPC side of
// every reply is a pure lookup over pendingActions/rationale that's already
// shown elsewhere in the UI (adjudication history, the toast stack) — never
// free-form generation — so a reply is always traceable back to real state,
// the same "not a black box" rule the adjudicators follow.
export interface ChatMessage {
  id: string;
  orgId: string;
  targetId: string | null;
  from: 'user' | 'npc';
  authorName: string;
  authorRoleLabel: string;
  text: string;
  t: number;
}

function craftNpcReply(orgId: string, targetId: string | null, targets: Target[], pendingActions: PendingAction[]): { authorName: string; authorRoleLabel: string; text: string } {
  const org = orgById(orgId);
  if (!org) return { authorName: 'System', authorRoleLabel: '', text: 'No such organization on file.' };
  const chairRole = org.requiredRoles[0];
  const spokesperson = entityForRole(chairRole, org);
  const authorName = spokesperson?.name ?? org.acronym;
  const authorRoleLabel = spokesperson ? roleLabel(chairRole) : org.kind;

  if (targetId) {
    const target = targets.find((x) => x.id === targetId);
    const name = target?.name ?? targetId.slice(1);
    const relevant = pendingActions.filter((a) => a.orgId === orgId && a.targetId === targetId).sort((a, b) => b.submittedAt - a.submittedAt)[0];
    if (!relevant) return { authorName, authorRoleLabel, text: `Nothing from ${name} in our queue right now.` };
    if (relevant.status === 'pending') {
      return { authorName, authorRoleLabel, text: `${name} is still on our board — due ${fmtLogTime(relevant.adjudicationDueAt)}. Nothing more to say before we rule.` };
    }
    const verdict = relevant.status === 'approved' ? 'APPROVED' : 'HELD';
    return { authorName, authorRoleLabel, text: `${name} — we ruled ${verdict}: ${relevant.rationale}` };
  }

  const pendingHere = pendingActions.filter((a) => a.orgId === orgId && a.status === 'pending');
  if (pendingHere.length === 0) return { authorName, authorRoleLabel, text: 'Nothing in our queue right now.' };
  const list = pendingHere
    .map((a) => {
      const target = targets.find((x) => x.id === a.targetId);
      return `${target?.name ?? a.targetId} (${a.kind.replace('toggleAppr:', '').toUpperCase()})`;
    })
    .join(', ');
  return { authorName, authorRoleLabel, text: `Currently sitting on ${pendingHere.length}: ${list}.` };
}

// One entry per PendingAction `kind` — the actual judgment an adjudicating
// role-holder applies, checking the same conditions the UI already shows
// the user so the "why" is never a black box.
const ADJUDICATORS: Record<string, (target: Target) => AdjudicationResult> = {
  'toggleAppr:pid': (target) => {
    const reasons: string[] = [];
    if (target.conf < 70) reasons.push(`classification confidence too low for positive ID (${target.conf}%)`);
    return { approve: reasons.length === 0, reasons };
  },
  'toggleAppr:jag': (target) => {
    const reasons: string[] = [];
    if (target.cde === 'CDE-5') reasons.push(`collateral damage estimate (${target.cde}) requires elevated legal review`);
    return { approve: reasons.length === 0, reasons };
  },
  'toggleAppr:strike': (target) => {
    const reasons: string[] = [];
    if (!target.appr.pid) reasons.push('PID not established');
    if (!target.appr.jag) reasons.push('ROE/JAG review not complete');
    if (target.cde === 'CDE-4' || target.cde === 'CDE-5') reasons.push(`collateral damage estimate too high (${target.cde})`);
    return { approve: reasons.length === 0, reasons };
  },
  'toggleAppr:tea': (target) => {
    // TEA is the last, highest gate — doctrinally it presumes the other
    // three are already in hand, not a fresh independent check.
    const reasons: string[] = [];
    if (!target.appr.pid) reasons.push('PID not yet established');
    if (!target.appr.jag) reasons.push('ROE/JAG review not yet complete');
    if (!target.appr.strike) reasons.push('Strike Cell has not yet concurred');
    return { approve: reasons.length === 0, reasons };
  },
  nominateTarget: (target) => {
    const reasons: string[] = [];
    if (target.aff === 'NEU') reasons.push('neutral affiliation — does not meet high-payoff target criteria');
    if (!target.threat) reasons.push('no threat assessment on file yet');
    if (target.pri != null) reasons.push('already carries a priority rank');
    return { approve: reasons.length === 0, reasons };
  },
};

// A snapshot of everything a tutorial's generic navigation/notification
// effects can touch, captured at startTutorial and restored at
// exitTutorial. Anything a tutorial changes that round-trips through the
// server (a target's approvals, etc.) can't be restored this way — those
// fields are reverted by the tutorial's own `cleanup()` issuing real
// inverse actions instead. See assets/tutorials.ts.
interface TutorialSnapshot {
  activeManager: Manager;
  cardKind: CardKind;
  cardId: string | null;
  cardTab: number;
  cardX: number;
  cardY: number;
  view: View;
  activeListId: TargetListId;
  oobSelectedId: string | null;
  toasts: Toast[];
  pendingActions: PendingAction[];
  targetListTransitions: TargetListTransition[];
  chatMessages: ChatMessage[];
  activeChatOrgId: string | null;
  activeChatTargetId: string | null;
}

// A card the user has pinned open via the thumbtack button — pinning moves
// a card out of the single transient cardKind/cardId/cardTab/cardX/cardY
// slot (which stays exactly as it behaved before pinning existed: one
// card, replaced whenever something new is opened) and into this list,
// where it keeps rendering as its own independent floating card until
// explicitly closed or unpinned. `key` is a stable identity for one
// (kind, id) pair so the same entity can't end up pinned twice.
export interface PinnedCard {
  key: string;
  kind: CardKind;
  id: string;
  tab: number;
  x: number;
  y: number;
}

export function cardKey(kind: CardKind, id: string): string {
  return `${kind}:${id}`;
}

interface UiState {
  connected: boolean;
  cardKind: CardKind;
  cardId: string | null;
  cardTab: number;
  cardX: number;
  cardY: number;
  pinnedCards: PinnedCard[];
  basemapId: string;
  // EPSG code TacticalMap's OpenLayers View renders in — see
  // mapProjection.ts's PROJECTION_OPTIONS for the offered set.
  mapProjectionCode: string;
  // Selects the ol-cesium perspective mode (altitude plan Plan C / Phase 3)
  // — '3D' and '2.5D' both synchronize the existing OpenLayers 2D map into
  // a Cesium globe rather than replacing it; '2.5D' additionally locks the
  // camera to a fixed look angle/heading (see cesium3d.ts's MapMode).
  // Cesium/olcs are dynamically imported on first activation into either
  // mode, not at module load, since they're large and most sessions will
  // never toggle off '2D'.
  mapMode: MapMode;
  activeManager: Manager;
  legendMode: LegendMode;
  // Gates the altitude tag/stem TrackSymbol draws for airborne targets —
  // see the altitude display plan's Plan A / Risk 04. Off by default so
  // the feature is opt-in rather than always-on clutter.
  showAltitude: boolean;
  activeListId: TargetListId;
  // Last-observed list membership per target id, and the append-only log of
  // moments a target first qualified for a list — see targetLists.ts for why
  // this exists (it's what makes "state transitions" real, not just the
  // named taxonomy). Both are derived client-side in setFromServer; neither
  // is sent by the server.
  targetListMembership: Record<string, TargetListId[]>;
  targetListTransitions: TargetListTransition[];
  toasts: Toast[];
  pendingActions: PendingAction[];
  // Gap 4: org-scoped chat threads (optionally tagged to a target's pending
  // action). Purely client-side, same as pendingActions — nothing here
  // round-trips through the server.
  chatMessages: ChatMessage[];
  activeChatOrgId: string | null;
  activeChatTargetId: string | null;
  oobSelectedId: string | null;
  contextLayerVisibility: Record<string, boolean>;
  ports: Record<string, PortFeature>;
  airfields: Record<string, AirfieldFeature>;
  flyToRequest: { lng: number; lat: number; zoom: number } | null;
  // Bumped (never read for its value) to ask TacticalMap to reset the map's
  // rotation back to "up is North" — needed because ol-cesium's Camera
  // keeps the OL View's rotation synced to the Cesium camera heading while
  // 3D mode is active, so leaving 3D can strand the 2D map rotated.
  resetNorthRequest: number;
  oobStyle: OobStyle;
  // OOB contact id -> assigned VesselProfile id (assets/vesselProfiles.ts).
  // A client-side overlay on top of the static OOB tree — assigning an
  // identity doesn't mutate assets/oob.ts data, it just records the
  // analyst's tentative call, which components read alongside the node.
  contactIdentityAssignments: Record<string, string>;
  // Knowledge-base graph: kbAssociations is a user-created, symmetric
  // URI-to-URI adjacency list (same client-side-overlay precedent as
  // contactIdentityAssignments above — not persisted server-side yet) that
  // kb/deriveGraph.ts merges into the derived JSON-LD graph as
  // `associatedWith` edges. kbSelectedUri is the currently focused KG node.
  kbAssociations: Record<string, string[]>;
  kbSelectedUri: string | null;
  // Shared width for the right rail (target workup, event log, command
  // bar ROE/clock) — see layout.ts for why these three stay in sync.
  rightRailWidth: number;
  // The running tutorial (assets/tutorials.ts), if any — null when none is
  // active. tutorialScratch is a free-form bag a tutorial's own steps use
  // to remember things across steps (e.g. a target's pre-tutorial approval
  // state, so cleanup can restore exactly that rather than guessing).
  activeTutorialId: string | null;
  tutorialStepIndex: number;
  tutorialSnapshot: TutorialSnapshot | null;
  tutorialScratch: Record<string, unknown>;
  drawTool: DrawToolState;
  // Persisted drawn shapes (drawnShapes.ts on the server), cached per
  // layer+object key (`${layerId}:${objectId}`) so a shape only needs
  // fetching once per object card visit — see loadDrawnShapes.
  drawnShapes: Record<string, FeatureCollection>;
}

interface Actions {
  setFromServer: (s: State) => void;
  setConnected: (v: boolean) => void;

  selectTarget: (id: string) => void;
  setView: (v: View) => void;
  cycleRoe: () => void;
  retaskSensor: (sensorId: string) => void;
  assignEffector: (effectorId: string) => void;
  toggleAppr: (key: keyof Approvals, targetId?: string) => void;
  submitApproval: (key: keyof Approvals, targetId: string) => void;
  submitTargetNomination: (targetId: string) => void;
  submitPendingAction: (kind: string, targetId: string, orgId: string) => void;
  assignPriority: (targetId: string) => void;
  clearPriority: (targetId: string) => void;
  openChat: (orgId: string, targetId?: string) => void;
  setChatTargetScope: (targetId: string | null) => void;
  sendChatMessage: (text: string) => void;
  resolveDuePendingActions: () => void;
  forceResolvePendingAction: (id: string) => void;
  resolvePendingActionsByIds: (ids: string[]) => void;
  engage: () => void;
  setStage: (id: string, stageIdx: number) => void;
  advanceStage: () => void;
  retreatStage: () => void;

  openEntity: (kind: CardKind, id: string) => void;
  openCard: (id: string) => void;
  closeCard: () => void;
  setCardTab: (i: number) => void;
  moveCardTo: (x: number, y: number) => void;
  pinCurrentCard: () => void;
  unpinCard: (key: string) => void;
  closePinnedCard: (key: string) => void;
  setPinnedCardTab: (key: string, i: number) => void;
  movePinnedCardTo: (key: string, x: number, y: number) => void;
  setBasemap: (id: string) => void;
  setMapMode: (m: MapMode) => void;
  setMapProjectionCode: (code: string) => void;
  setActiveManager: (m: Manager) => void;
  setLegendMode: (m: LegendMode) => void;
  setShowAltitude: (v: boolean) => void;
  setActiveListId: (id: TargetListId) => void;
  selectOob: (id: string) => void;
  openOob: (id: string) => void;
  toggleContextLayer: (id: string) => void;
  openPort: (feature: PortFeature) => void;
  openAirfield: (feature: AirfieldFeature) => void;
  flyTo: (lng: number, lat: number, zoom?: number) => void;
  resetNorth: () => void;
  setOobStyleColor: (key: keyof OobStyle, hex: string) => void;
  assignContactIdentity: (contactId: string, profileId: string) => void;
  clearContactIdentity: (contactId: string) => void;
  selectKbEntity: (uri: string) => void;
  associateEntities: (uriA: string, uriB: string) => void;
  dissociateEntities: (uriA: string, uriB: string) => void;
  dismissToast: (id: string) => void;
  setRightRailWidth: (w: number) => void;
  startTutorial: (id: string) => void;
  advanceTutorial: () => void;
  fastForwardTutorial: () => void;
  exitTutorial: () => void;

  openDrawingTool: () => void;
  setDrawImage: (dataUrl: string, naturalWidth: number, naturalHeight: number) => void;
  addImageControlPoint: (x: number, y: number) => void;
  addMapControlPoint: (lng: number, lat: number) => void;
  removeControlPoint: (index: number) => void;
  confirmControlPoints: () => void;
  setDrawnPolygon: (coords: [number, number][]) => void;
  resetDrawTool: () => void;
  saveDrawnShape: (args: { name: string; layerId: DrawLayerId; objectId: string; objectLabel: string }) => Promise<void>;
  loadDrawnShapes: (layerId: DrawLayerId, objectId: string) => Promise<void>;
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
  pinnedCards: [],
  basemapId: 'tactical',
  mapMode: '2D',
  mapProjectionCode: 'EPSG:3857',
  activeManager: 'isr',
  legendMode: 'AFFILIATION',
  showAltitude: false,
  activeListId: 'hptl',
  targetListMembership: {},
  targetListTransitions: [],
  toasts: [],
  pendingActions: [],
  chatMessages: [],
  activeChatOrgId: ORGANIZATIONS[0].id,
  activeChatTargetId: null,
  oobSelectedId: null,
  contextLayerVisibility: Object.fromEntries(CONTEXT_LAYERS.map((l) => [l.id, l.defaultVisible])),
  ports: {},
  airfields: {},
  flyToRequest: null,
  resetNorthRequest: 0,
  oobStyle: { radarColor: '#3fd2e6', weaponColor: '#ffab38' },
  contactIdentityAssignments: {},
  kbAssociations: {},
  kbSelectedUri: null,
  rightRailWidth: RIGHT_RAIL_MIN_WIDTH,
  activeTutorialId: null,
  tutorialStepIndex: 0,
  tutorialSnapshot: null,
  tutorialScratch: {},
  drawTool: INITIAL_DRAW_TOOL,
  drawnShapes: {},

  setFromServer: (s) => {
    set((prev) => {
      const patch: Partial<State> = {};
      for (const key of Object.keys(s) as (keyof State)[]) {
        if (!deepEqual(prev[key], s[key])) {
          (patch as Record<string, unknown>)[key] = s[key];
        }
      }
      if (!patch.targets) return patch;

      // First hydration just establishes a baseline — nothing "transitioned"
      // onto a list, it was simply already there when we started observing.
      // Every update after that, a target gaining a list it didn't have a
      // moment ago is logged as a real, timestamped join event.
      const isFirstHydration = Object.keys(prev.targetListMembership).length === 0;
      const nextMembership: Record<string, TargetListId[]> = {};
      const newTransitions: TargetListTransition[] = [];
      const newToasts: Toast[] = [];
      for (const target of patch.targets) {
        const lists = listsForTarget(target);
        nextMembership[target.id] = lists;
        if (!isFirstHydration) {
          const prevLists = prev.targetListMembership[target.id] ?? [];
          for (const listId of lists) {
            if (!prevLists.includes(listId)) {
              const joinedAt = patch.t ?? prev.t;
              newTransitions.push({ targetId: target.id, listId, joinedAt });
              const def = TARGET_LISTS.find((l) => l.id === listId)!;
              newToasts.push({ id: `${target.id}-${listId}-${joinedAt}-${Math.random().toString(36).slice(2, 7)}`, text: `${target.id.slice(1)} ${target.name} → ${def.acronym}`, accent: def.accent });
            }
          }
        }
      }
      return {
        ...patch,
        targetListMembership: nextMembership,
        targetListTransitions: newTransitions.length ? [...newTransitions, ...prev.targetListTransitions].slice(0, 200) : prev.targetListTransitions,
        toasts: newToasts.length ? [...prev.toasts, ...newToasts].slice(-40) : prev.toasts,
      };
    });
    // Every server tick is also a chance for a board/cell/etc. to have
    // reached its adjudication deadline on something submitted earlier.
    get().resolveDuePendingActions();
  },
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
  toggleAppr: (key, targetId) => sendAction('toggleAppr', { key, id: targetId }),
  submitApproval: (key, targetId) => {
    const kind = `toggleAppr:${key}`;
    const route = ACTION_ROUTING.find((r) => r.action === kind);
    if (!route) return;
    get().submitPendingAction(kind, targetId, route.orgId);
  },
  submitTargetNomination: (targetId) => {
    const route = ACTION_ROUTING.find((r) => r.action === 'nominateTarget')!;
    get().submitPendingAction('nominateTarget', targetId, route.orgId);
  },
  submitPendingAction: (kind, targetId, orgId) => {
    const alreadyPending = get().pendingActions.some((a) => a.targetId === targetId && a.kind === kind && a.status === 'pending');
    if (alreadyPending) return;
    const org = orgById(orgId);
    if (!org) return;
    const now = get().t;
    const action: PendingAction = {
      id: `${kind}-${targetId}-${now}-${Math.random().toString(36).slice(2, 7)}`,
      kind,
      targetId,
      orgId: org.id,
      submittedBy: 'user',
      submittedAt: now,
      adjudicationDueAt: now + org.cadenceSeconds,
      status: 'pending',
    };
    set((prev) => ({ pendingActions: [...prev.pendingActions, action] }));
  },
  assignPriority: (targetId) => {
    const targets = get().targets;
    const nextRank = Math.max(0, ...targets.map((t) => t.pri ?? 0)) + 1;
    sendAction('setPriority', { id: targetId, pri: nextRank });
  },
  clearPriority: (targetId) => sendAction('setPriority', { id: targetId, pri: null }),
  openChat: (orgId, targetId) => set({ activeManager: 'chat', activeChatOrgId: orgId, activeChatTargetId: targetId ?? null }),
  setChatTargetScope: (targetId) => set({ activeChatTargetId: targetId }),
  sendChatMessage: (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const { activeChatOrgId, activeChatTargetId, targets, pendingActions, t } = get();
    if (!activeChatOrgId) return;
    const userMsg: ChatMessage = {
      id: `chat-${t}-${Math.random().toString(36).slice(2, 7)}`,
      orgId: activeChatOrgId,
      targetId: activeChatTargetId,
      from: 'user',
      authorName: 'YOU',
      authorRoleLabel: roleLabel('targeteer'),
      text: trimmed,
      t,
    };
    const reply = craftNpcReply(activeChatOrgId, activeChatTargetId, targets, pendingActions);
    const npcMsg: ChatMessage = {
      id: `chat-${t}-${Math.random().toString(36).slice(2, 7)}-r`,
      orgId: activeChatOrgId,
      targetId: activeChatTargetId,
      from: 'npc',
      authorName: reply.authorName,
      authorRoleLabel: reply.authorRoleLabel,
      text: reply.text,
      t,
    };
    set((prev) => ({ chatMessages: [...prev.chatMessages, userMsg, npcMsg] }));
  },
  resolveDuePendingActions: () => {
    const { pendingActions, t } = get();
    const dueIds = pendingActions.filter((a) => a.status === 'pending' && a.adjudicationDueAt <= t).map((a) => a.id);
    get().resolvePendingActionsByIds(dueIds);
  },
  forceResolvePendingAction: (id) => get().resolvePendingActionsByIds([id]),
  resolvePendingActionsByIds: (ids: string[]) => {
    const { pendingActions, t, targets } = get();
    const due = pendingActions.filter((a) => ids.includes(a.id) && a.status === 'pending');
    if (due.length === 0) return;

    const resolvedById = new Map<string, PendingAction>();
    const newToasts: Toast[] = [];
    for (const action of due) {
      const target = targets.find((x) => x.id === action.targetId);
      const org = orgById(action.orgId);
      // Credit the specific role ACTION_ROUTING says owns this action —
      // not just whoever happens to be first in the org's member list —
      // so "who decided this" is a real, named answer, not a guess.
      const route = ACTION_ROUTING.find((r) => r.action === action.kind);
      const resolvingEntity = route ? entityForRole(route.ownerRole, org) : undefined;
      const resolvedBy = resolvingEntity?.id ?? org?.memberIds[0] ?? 'npc-chair';
      const resolvingLabel = resolvingEntity && route ? `${resolvingEntity.name} (${roleLabel(route.ownerRole)})` : (org?.acronym ?? action.orgId.toUpperCase());
      const orgName = org?.acronym ?? action.orgId.toUpperCase();

      if (!target) {
        resolvedById.set(action.id, { ...action, status: 'rejected', resolvedAt: t, resolvedBy, rationale: 'Target no longer on file at adjudication time.' });
        continue;
      }
      const adjudicate = ADJUDICATORS[action.kind];
      const { approve, reasons } = adjudicate ? adjudicate(target) : { approve: true, reasons: [] };
      const rationale = approve ? 'Conditions met; within delegated authority.' : `Held: ${reasons.join('; ')}.`;
      resolvedById.set(action.id, { ...action, status: approve ? 'approved' : 'rejected', resolvedAt: t, resolvedBy, rationale });
      newToasts.push({
        id: `resolve-${action.id}`,
        text: `${target.id.slice(1)} ${target.name} — ${orgName} ${approve ? 'APPROVED' : 'HELD'} (${resolvingLabel}): ${rationale}`,
        accent: approve ? 'var(--green)' : 'var(--red)',
      });
      // Applying the effect of an approval is itself per-kind.
      if (approve) {
        if (action.kind.startsWith('toggleAppr:')) {
          const key = action.kind.slice('toggleAppr:'.length) as keyof Approvals;
          get().toggleAppr(key, target.id);
        } else if (action.kind === 'nominateTarget') {
          get().assignPriority(target.id);
        }
      }
    }

    set((prev) => ({
      pendingActions: prev.pendingActions.map((a) => resolvedById.get(a.id) ?? a),
      toasts: newToasts.length ? [...prev.toasts, ...newToasts].slice(-40) : prev.toasts,
    }));
  },
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
  pinCurrentCard: () => {
    const { cardKind, cardId, cardTab, cardX, cardY } = get();
    if (cardId == null) return;
    const key = cardKey(cardKind, cardId);
    set((prev) => {
      if (prev.pinnedCards.some((c) => c.key === key)) return { cardId: null };
      // The card being pinned keeps its exact on-screen position (x, y) —
      // it must not jump. What needs to change is where the *next* card
      // opens: cardX/cardY is reused as-is by every open action unless the
      // user drags, so without nudging it here, whatever opens next would
      // spawn exactly on top of the card just pinned — same screen
      // position — and its higher zIndex would block clicks on the pinned
      // card underneath. 90px clears the header button cluster (~65px in
      // from a card's right edge) past a same-width card's right edge, so
      // the pinned card's controls stay reachable once something new opens.
      const step = 90;
      return {
        pinnedCards: [...prev.pinnedCards, { key, kind: cardKind, id: cardId, tab: cardTab, x: cardX, y: cardY }],
        cardId: null,
        cardX: cardX + step,
        cardY: cardY + step,
      };
    });
  },
  // Unpinning hands the card back to the single transient slot — same as
  // opening it fresh — so it keeps behaving like a normal card again
  // (replaceable by the next thing opened) rather than just vanishing.
  unpinCard: (key) => {
    set((prev) => {
      const entry = prev.pinnedCards.find((c) => c.key === key);
      if (!entry) return prev;
      return {
        pinnedCards: prev.pinnedCards.filter((c) => c.key !== key),
        cardKind: entry.kind,
        cardId: entry.id,
        cardTab: entry.tab,
        cardX: entry.x,
        cardY: entry.y,
      };
    });
  },
  closePinnedCard: (key) => set((prev) => ({ pinnedCards: prev.pinnedCards.filter((c) => c.key !== key) })),
  setPinnedCardTab: (key, i) => set((prev) => ({ pinnedCards: prev.pinnedCards.map((c) => (c.key === key ? { ...c, tab: i } : c)) })),
  movePinnedCardTo: (key, x, y) => set((prev) => ({ pinnedCards: prev.pinnedCards.map((c) => (c.key === key ? { ...c, x: Math.max(0, x), y: Math.max(0, y) } : c)) })),
  setBasemap: (id) => set({ basemapId: id }),
  setMapMode: (m) => set({ mapMode: m }),
  setMapProjectionCode: (code) => set({ mapProjectionCode: code }),
  setActiveManager: (m) => set({ activeManager: m }),
  setRightRailWidth: (w) => set({ rightRailWidth: Math.min(RIGHT_RAIL_MAX_WIDTH, Math.max(RIGHT_RAIL_MIN_WIDTH, w)) }),
  setLegendMode: (m) => set({ legendMode: m }),
  setShowAltitude: (v) => set({ showAltitude: v }),
  setActiveListId: (id) => set({ activeListId: id }),
  selectOob: (id) => {
    const node = findOobNode(id);
    set({
      oobSelectedId: id,
      activeManager: 'oob',
      ...(node?.entityType === 'object' ? { cardKind: 'oobObject' as const, cardId: id, cardTab: 0 } : {}),
    });
  },
  openOob: (id) => set({ oobSelectedId: id, activeManager: 'oob', cardKind: 'oobObject', cardId: id, cardTab: 0 }),
  toggleContextLayer: (id) => set((prev) => ({ contextLayerVisibility: { ...prev.contextLayerVisibility, [id]: !prev.contextLayerVisibility[id] } })),
  openPort: (feature) => set((prev) => ({ ports: { ...prev.ports, [feature.id]: feature }, cardKind: 'port', cardId: feature.id, cardTab: 0 })),
  openAirfield: (feature) => set((prev) => ({ airfields: { ...prev.airfields, [feature.id]: feature }, cardKind: 'airfield', cardId: feature.id, cardTab: 0 })),
  flyTo: (lng, lat, zoom = 13) => {
    set({ flyToRequest: { lng, lat, zoom } });
    if (get().view !== 'MAP') get().setView('MAP');
  },
  resetNorth: () => set((prev) => ({ resetNorthRequest: prev.resetNorthRequest + 1 })),
  setOobStyleColor: (key, hex) => set((prev) => ({ oobStyle: { ...prev.oobStyle, [key]: hex } })),
  assignContactIdentity: (contactId, profileId) => set((prev) => ({ contactIdentityAssignments: { ...prev.contactIdentityAssignments, [contactId]: profileId } })),
  clearContactIdentity: (contactId) =>
    set((prev) => {
      const next = { ...prev.contactIdentityAssignments };
      delete next[contactId];
      return { contactIdentityAssignments: next };
    }),
  selectKbEntity: (uri) => set({ kbSelectedUri: uri, activeManager: 'kb', cardKind: 'kbEntity', cardId: uri, cardTab: 0 }),
  associateEntities: (uriA, uriB) =>
    set((prev) => {
      if (uriA === uriB) return prev;
      const addEdge = (map: Record<string, string[]>, from: string, to: string) => {
        const existing = map[from] ?? [];
        return existing.includes(to) ? map : { ...map, [from]: [...existing, to] };
      };
      const withA = addEdge(prev.kbAssociations, uriA, uriB);
      const withBoth = addEdge(withA, uriB, uriA);
      return { kbAssociations: withBoth };
    }),
  dissociateEntities: (uriA, uriB) =>
    set((prev) => {
      const removeEdge = (map: Record<string, string[]>, from: string, to: string) => {
        if (!map[from]) return map;
        return { ...map, [from]: map[from].filter((u) => u !== to) };
      };
      const withA = removeEdge(prev.kbAssociations, uriA, uriB);
      const withBoth = removeEdge(withA, uriB, uriA);
      return { kbAssociations: withBoth };
    }),
  dismissToast: (id) => set((prev) => ({ toasts: prev.toasts.filter((t) => t.id !== id) })),
  startTutorial: (id) => {
    const tutorial = TUTORIALS.find((tu) => tu.id === id);
    if (!tutorial) return;
    const prev = get();
    const snapshot: TutorialSnapshot = {
      activeManager: prev.activeManager,
      cardKind: prev.cardKind,
      cardId: prev.cardId,
      cardTab: prev.cardTab,
      cardX: prev.cardX,
      cardY: prev.cardY,
      view: prev.view,
      activeListId: prev.activeListId,
      oobSelectedId: prev.oobSelectedId,
      toasts: prev.toasts,
      pendingActions: prev.pendingActions,
      targetListTransitions: prev.targetListTransitions,
      chatMessages: prev.chatMessages,
      activeChatOrgId: prev.activeChatOrgId,
      activeChatTargetId: prev.activeChatTargetId,
    };
    set({ activeTutorialId: id, tutorialStepIndex: 0, tutorialSnapshot: snapshot, tutorialScratch: {} });
    tutorial.steps[0]?.run?.();
  },
  advanceTutorial: () => {
    const { activeTutorialId, tutorialStepIndex } = get();
    const tutorial = TUTORIALS.find((tu) => tu.id === activeTutorialId);
    if (!tutorial) return;
    const nextIndex = tutorialStepIndex + 1;
    if (nextIndex >= tutorial.steps.length) {
      get().exitTutorial();
      return;
    }
    set({ tutorialStepIndex: nextIndex });
    tutorial.steps[nextIndex]?.run?.();
  },
  fastForwardTutorial: () => {
    const { activeTutorialId, tutorialStepIndex } = get();
    const tutorial = TUTORIALS.find((tu) => tu.id === activeTutorialId);
    tutorial?.steps[tutorialStepIndex]?.fastForward?.();
  },
  exitTutorial: () => {
    const { activeTutorialId, tutorialSnapshot } = get();
    const tutorial = TUTORIALS.find((tu) => tu.id === activeTutorialId);
    tutorial?.cleanup?.();
    if (tutorialSnapshot) set(tutorialSnapshot);
    set({ activeTutorialId: null, tutorialStepIndex: 0, tutorialSnapshot: null, tutorialScratch: {} });
  },

  openDrawingTool: () => set({ activeManager: 'draw' }),
  setDrawImage: (dataUrl, naturalWidth, naturalHeight) =>
    set({
      drawTool: { ...INITIAL_DRAW_TOOL, phase: 'control-points', imageDataUrl: dataUrl, imageNaturalWidth: naturalWidth, imageNaturalHeight: naturalHeight },
    }),
  addImageControlPoint: (x, y) => set((prev) => ({ drawTool: { ...prev.drawTool, pendingImagePoint: { x, y } } })),
  addMapControlPoint: (lng, lat) =>
    set((prev) => {
      const pending = prev.drawTool.pendingImagePoint;
      if (!pending) return prev;
      const point: DrawControlPoint = { imageX: pending.x, imageY: pending.y, lng, lat };
      return { drawTool: { ...prev.drawTool, controlPoints: [...prev.drawTool.controlPoints, point], pendingImagePoint: null } };
    }),
  removeControlPoint: (index) => set((prev) => ({ drawTool: { ...prev.drawTool, controlPoints: prev.drawTool.controlPoints.filter((_, i) => i !== index) } })),
  confirmControlPoints: () =>
    set((prev) => (prev.drawTool.controlPoints.length >= 3 ? { drawTool: { ...prev.drawTool, phase: 'polygon' } } : prev)),
  setDrawnPolygon: (coords) => set((prev) => ({ drawTool: { ...prev.drawTool, polygonLngLat: coords, phase: 'associate' } })),
  resetDrawTool: () => set({ drawTool: INITIAL_DRAW_TOOL }),
  saveDrawnShape: async ({ name, layerId, objectId, objectLabel }) => {
    const ring = get().drawTool.polygonLngLat;
    if (!ring || ring.length < 3) return;
    const closedRing = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring : [...ring, ring[0]];
    const geometry: Polygon = { type: 'Polygon', coordinates: [closedRing] };
    const res = await fetch('/api/drawn-shapes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, layerId, objectId, objectLabel, geometry }),
    });
    if (!res.ok) throw new Error(`Failed to save drawn shape: ${res.status}`);
    get().resetDrawTool();
    await get().loadDrawnShapes(layerId, objectId);
  },
  loadDrawnShapes: async (layerId, objectId) => {
    const res = await fetch(`/api/drawn-shapes?layerId=${encodeURIComponent(layerId)}&objectId=${encodeURIComponent(objectId)}`);
    if (!res.ok) return;
    const shapes: { id: string; name: string; objectLabel: string; geometry: Polygon }[] = await res.json();
    const fc: FeatureCollection = {
      type: 'FeatureCollection',
      features: shapes.map((s) => ({ type: 'Feature', id: s.id, properties: { name: s.name, objectLabel: s.objectLabel }, geometry: s.geometry })),
    };
    set((prev) => ({ drawnShapes: { ...prev.drawnShapes, [`${layerId}:${objectId}`]: fc } }));
  },
}));
