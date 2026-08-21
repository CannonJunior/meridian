// The five target lists produced by the joint targeting cycle (JP 3-60),
// re-purposed here as selectable views over the same `targets` array — the
// collection-table (components/CollectionTable.tsx) renders whichever list
// is currently selected (store.activeListId).
import type { Target, TargetListId } from '../types';

export interface TargetListDef {
  id: TargetListId;
  acronym: string;
  name: string;
  accent: string; // CSS var, e.g. 'var(--amber)'
  description: string; // one-line summary for the list picker row
  detail: string; // longer doctrine paragraph, shown when a row is expanded
}

export const TARGET_LISTS: TargetListDef[] = [
  {
    id: 'hptl',
    acronym: 'HPTL',
    name: 'High-Payoff Target List',
    accent: 'var(--amber)',
    description: 'Targets ranked by payoff toward current objectives — the working prioritized list.',
    detail:
      "Targets ranked by payoff toward current objectives — the ones whose loss to the enemy would most directly contribute to the mission. Built each targeting cycle from target value analysis, then filtered to only targets the force can actually acquire and engage within the decision window. Priority order drives sensor/effector pairing and shifts as objectives and target behavior change. Every target with an assigned priority rank sits on this list; unranked no-strike or already-neutralized entries fall off it.",
  },
  {
    id: 'jtl',
    acronym: 'JTL',
    name: 'Joint Target List',
    accent: 'var(--cyan)',
    description: 'The full inventory of vetted, validated targets nominated across the joint force — unranked, unrestricted.',
    detail:
      "The master target database an operation draws from. Every target on it has been nominated by a component and passed vetting (accuracy, target ID confidence) and validation (lawful, relevant, meets the commander's objectives) — but membership alone carries no priority or restriction. The JTL is the pool the HPTL prioritizes from and the RTL/NSL carve restrictions out of; it's the broadest of the five lists.",
  },
  {
    id: 'jiptl',
    acronym: 'JIPTL',
    name: 'Joint Integrated Prioritized Target List',
    accent: 'var(--green)',
    description: 'The JFC-approved, prioritized target list actually tasked for engagement this cycle.',
    detail:
      "Assembled in the decision / force-assignment phase of the targeting cycle from component nominations and HPTL prioritization, coordinated through the Joint Targeting Coordination Board (JTCB), and formally approved by the joint force commander or a designated representative. It's the operative \"what gets struck, in what order\" list — the point where prioritization and restrictions are reconciled before tasking to the ATO. Shown here as the subset of prioritized targets that have cleared strike approval.",
  },
  {
    id: 'rtl',
    acronym: 'RTL',
    name: 'Restricted Target List',
    accent: 'var(--yellow)',
    description: 'Targets cleared for engagement only under specific conditions — timing, method, or approval authority.',
    detail:
      'Nominated by joint force elements and approved by the JFC, plus any restrictions directed by higher authority. A target lands here for reasons like elevated collateral damage risk, proximity to a protected site, or a political/legal constraint — day-only windows, precision-weapon-only, or elevated release authority. Unlike the NSL, RTL targets can still be struck once the stated condition is met. Shown here as active targets carrying an elevated collateral damage estimate.',
  },
  {
    id: 'nsl',
    acronym: 'NSL',
    name: 'No-Strike List',
    accent: 'var(--red)',
    description: 'Objects and locations protected from attack outright — no targeting authority exists absent a status change.',
    detail:
      "Compiled by the JFC with legal and targeting-staff input, the NSL protects entities like hospitals, cultural/religious property, diplomatic facilities, and identified civilian traffic under the law of war or the current ROE. It's checked as a hard constraint at every stage of the targeting cycle — an NSL hit disqualifies a target outright, unlike an RTL hit, which only conditions it.",
  },
];

// Membership rules — derived from existing Target fields rather than a
// separate list-assignment field, since each list is a real filter over the
// same underlying target set:
//  - HPTL:  has an assigned priority rank.
//  - JTL:   every nominated/tracked target, no filter — the full inventory.
//  - JIPTL: prioritized AND fully cleared for strike (appr.strike).
//  - RTL:   still active (not complete) AND carries an elevated CDE rating.
//  - NSL:   flagged as inside/near a no-strike zone.
//
// One predicate map drives both directions (which targets are on a list, and
// which lists a given target is on) so the two views can't drift apart.
const LIST_MEMBERSHIP: Record<TargetListId, (t: Target) => boolean> = {
  jtl: () => true,
  jiptl: (t) => t.pri != null && t.appr.strike,
  rtl: (t) => t.stage < 4 && (t.cde === 'CDE-2' || t.cde === 'CDE-3'),
  nsl: (t) => t.nsl,
  hptl: (t) => t.pri != null,
};

export function targetsForList(targets: Target[], listId: TargetListId): Target[] {
  return targets.filter(LIST_MEMBERSHIP[listId]);
}

// Every list a given target currently belongs to, in TARGET_LISTS order.
export function listsForTarget(t: Target): TargetListId[] {
  return TARGET_LISTS.map((l) => l.id).filter((id) => LIST_MEMBERSHIP[id](t));
}

// A named-list state transition: doctrinally, a target moving onto the JTL,
// RTL, JIPTL, etc. is a discrete, attributable event (a vetting decision, a
// JTCB approval), not just a silently-recomputed boolean. Meridian's list
// membership above is still derived from other fields rather than driven by
// an explicit nomination/approval workflow — but store.ts now diffs
// membership on every server update and records the moment a target first
// qualifies for a list, so at least the *transition itself* is a real,
// timestamped, auditable fact instead of nothing at all.
export interface TargetListTransition {
  targetId: string;
  listId: TargetListId;
  joinedAt: number; // simulation tick (State.t) when the transition was observed
}
