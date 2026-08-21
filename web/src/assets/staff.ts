// Staff roles, personnel, and the boards/bureaus/cells/centers/working
// groups that actually carry out the joint targeting process — see the
// Joint Targeting Field Guide (chapters 1-2) for the doctrine this models.
//
// This file is reference/seed data only — defining a role or an
// organization here doesn't change any behavior by itself. What makes an
// action actually route through one of these organizations is the
// pendingActions pipeline in store.ts; ACTION_ROUTING below documents the
// intended owner for every consequential user action, but `wired: true` is
// only set once an action genuinely goes through submit → pending →
// adjudicate rather than applying instantly. Currently that's just
// toggleAppr:strike, routed to the JTCB — everything else keeps its current
// instant behavior until a later pass generalizes the pattern.
//
// Every entity below is computer-controlled except 'user' — but nothing
// about the shape assumes that: `isUser` is just a boolean on an entity that
// otherwise looks exactly like any other seat-holder, so any NPC seat can
// later be handed to a second real human without changing this data's shape.

export type RoleId = 'targeteer' | 'j2' | 'j3' | 'j5' | 'sja' | 'weaponeer' | 'collection_manager' | 'battle_captain' | 'cco' | 'jtcb_chair';

export interface Role {
  id: RoleId;
  label: string;
  description: string;
}

export const ROLES: Role[] = [
  { id: 'targeteer', label: 'Targeteer', description: 'Develops the target, requests CDE, recommends munitions, and submits actions through the process.' },
  { id: 'j2', label: 'J2 — Intelligence', description: 'Supplies target nominations, all-source intelligence, PID, and BDA.' },
  { id: 'j3', label: 'J3 — Operations', description: "Sits the JTCB for most current-ops matters; owns execution and co-owns ROE." },
  { id: 'j5', label: 'J5 — Plans', description: 'Owns campaign-level objectives; co-owns ROE with J3.' },
  { id: 'sja', label: 'SJA — Staff Judge Advocate', description: 'Legal review for Law of War / ROE compliance. Advises ROE — does not write it.' },
  { id: 'weaponeer', label: 'Weaponeer', description: 'Computes weapon, fuzing, and probability of damage for a given target.' },
  { id: 'collection_manager', label: 'Collection Manager', description: 'Translates PIRs into NAI/SIR-level sensor tasking.' },
  { id: 'battle_captain', label: 'Battle Captain', description: 'Synchronizes the current watch floor for the duty officer.' },
  { id: 'cco', label: 'Chief of Combat Operations', description: 'Senior on-floor authority for dynamic, current-day targeting decisions.' },
  { id: 'jtcb_chair', label: 'JTCB Chair (Deputy JFC)', description: 'Chairs the Joint Targeting Coordination Board — final JIPTL and engagement-authority approval.' },
];

export interface StaffEntity {
  id: string;
  name: string;
  isUser: boolean;
  roles: RoleId[];
}

export const STAFF: StaffEntity[] = [
  { id: 'user', name: 'YOU', isUser: true, roles: ['targeteer'] },
  { id: 'npc-j2', name: 'Cdr. A. Reyes', isUser: false, roles: ['j2'] },
  { id: 'npc-j3', name: 'Col. M. Ibarra', isUser: false, roles: ['j3'] },
  { id: 'npc-j5', name: 'Lt Col. S. Okafor', isUser: false, roles: ['j5'] },
  { id: 'npc-sja', name: 'Cdr. P. Lindqvist', isUser: false, roles: ['sja'] },
  { id: 'npc-weaponeer', name: 'CWO3 D. Marsh', isUser: false, roles: ['weaponeer'] },
  { id: 'npc-collmgr', name: 'Lt. K. Tran', isUser: false, roles: ['collection_manager'] },
  { id: 'npc-battlecpt', name: 'Capt. E. Novak', isUser: false, roles: ['battle_captain'] },
  { id: 'npc-cco', name: 'Lt Col. H. Draper', isUser: false, roles: ['cco'] },
  { id: 'npc-chair', name: 'BGen. T. Whitfield', isUser: false, roles: ['jtcb_chair'] },
];

export type OrgKind = 'board' | 'bureau' | 'cell' | 'center' | 'working_group';

export interface Organization {
  id: string;
  name: string;
  acronym: string;
  kind: OrgKind;
  description: string;
  requiredRoles: RoleId[];
  memberIds: string[];
  // Simulated seconds from an action's submission to its adjudication —
  // real battle-rhythm cadences compressed to something a person testing
  // this can actually watch resolve (see the pilot in store.ts).
  cadenceSeconds: number;
}

export const ORGANIZATIONS: Organization[] = [
  {
    id: 'jtcb',
    name: 'Joint Targeting Coordination Board',
    acronym: 'JTCB',
    kind: 'board',
    description: 'Reviews and approves the JIPTL; adjudicates strike concurrence and target engagement authority.',
    requiredRoles: ['jtcb_chair', 'j2', 'j3', 'j5', 'sja'],
    memberIds: ['npc-chair', 'npc-j2', 'npc-j3', 'npc-j5', 'npc-sja'],
    cadenceSeconds: 75,
  },
  {
    id: 'jtwg',
    name: 'Joint Targeting Working Group',
    acronym: 'JTWG',
    kind: 'working_group',
    description: 'Consolidates and prioritizes target nominations before they reach the JTCB.',
    requiredRoles: ['j2', 'j3', 'j5', 'targeteer'],
    memberIds: ['npc-j2', 'npc-j3', 'npc-j5'],
    cadenceSeconds: 60,
  },
  {
    id: 'jfe',
    name: 'Joint Fires Element',
    acronym: 'JFE',
    kind: 'cell',
    description: "Synchronizes weaponeering and fires/effector pairing on the JFC's behalf.",
    requiredRoles: ['j3', 'weaponeer', 'targeteer'],
    memberIds: ['npc-j3', 'npc-weaponeer'],
    cadenceSeconds: 40,
  },
  {
    id: 'sja_review',
    name: 'Staff Judge Advocate Legal Review',
    acronym: 'SJA',
    kind: 'bureau',
    description: 'Law-of-war and ROE-compliance review of individual targeting decisions.',
    requiredRoles: ['sja'],
    memberIds: ['npc-sja'],
    cadenceSeconds: 30,
  },
  {
    id: 'collection_mgmt_board',
    name: 'Collection Management Board',
    acronym: 'CMB',
    kind: 'board',
    description: 'Arbitrates ISR sensor-tasking conflicts and reviews tentative contact identifications.',
    requiredRoles: ['collection_manager', 'j2'],
    memberIds: ['npc-collmgr', 'npc-j2'],
    cadenceSeconds: 50,
  },
  {
    id: 'cco_watch',
    name: 'Combat Operations Watch',
    acronym: 'COD',
    kind: 'center',
    description: 'The current-operations watch floor — dynamic targeting and weapons release, in real time.',
    requiredRoles: ['cco', 'battle_captain'],
    memberIds: ['npc-cco', 'npc-battlecpt'],
    cadenceSeconds: 15,
  },
];

// Which role/organization owns each consequential user action, per JP 3-60
// staff responsibilities. `wired` marks whether that ownership is actually
// enforced yet (submit → pending → adjudicate) or still just documented —
// see the file header.
export interface ActionRoute {
  action: string;
  ownerRole: RoleId;
  orgId: string;
  wired: boolean;
}

export const ACTION_ROUTING: ActionRoute[] = [
  { action: 'toggleAppr:pid', ownerRole: 'j2', orgId: 'collection_mgmt_board', wired: true },
  { action: 'toggleAppr:jag', ownerRole: 'sja', orgId: 'sja_review', wired: true },
  { action: 'toggleAppr:strike', ownerRole: 'j3', orgId: 'jtcb', wired: true },
  { action: 'toggleAppr:tea', ownerRole: 'jtcb_chair', orgId: 'jtcb', wired: true },
  { action: 'nominateTarget', ownerRole: 'j2', orgId: 'jtwg', wired: true },
  { action: 'cycleRoe', ownerRole: 'j5', orgId: 'jtcb', wired: false },
  { action: 'retaskSensor', ownerRole: 'collection_manager', orgId: 'collection_mgmt_board', wired: false },
  { action: 'assignEffector', ownerRole: 'weaponeer', orgId: 'jfe', wired: false },
  { action: 'engage', ownerRole: 'cco', orgId: 'cco_watch', wired: false },
  { action: 'assignContactIdentity', ownerRole: 'j2', orgId: 'collection_mgmt_board', wired: false },
];

export function orgById(id: string): Organization | undefined {
  return ORGANIZATIONS.find((o) => o.id === id);
}

export function staffById(id: string): StaffEntity | undefined {
  return STAFF.find((s) => s.id === id);
}

// The entity holding a role, preferring an org's own membership list (so a
// board's chair resolves to whichever entity actually sits that seat) and
// falling back to the first staff member with that role anywhere.
export function entityForRole(roleId: RoleId, org?: Organization): StaffEntity | undefined {
  if (org) {
    const seated = org.memberIds.map(staffById).find((e) => e?.roles.includes(roleId));
    if (seated) return seated;
  }
  return STAFF.find((e) => e.roles.includes(roleId));
}

export function roleLabel(id: RoleId): string {
  return ROLES.find((r) => r.id === id)?.label ?? id;
}
