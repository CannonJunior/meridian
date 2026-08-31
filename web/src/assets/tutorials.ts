// Guided walkthroughs of the Gaps 1/3/4/6 work — staff roles/organizations
// (assets/staff.ts) and the pending-action pipeline (store.ts's
// submitApproval/submitTargetNomination/resolveDuePendingActions). Each
// step's `run()` performs
// the real store actions it narrates — this is a tour of what actually
// happens, not a scripted animation — and every tutorial's `cleanup()`,
// together with the generic snapshot/restore in store.ts's
// startTutorial/exitTutorial, puts the system back exactly how it found it.
import { useStore } from '../store';
import { ACTION_ROUTING, ORGANIZATIONS, ROLES, STAFF, roleLabel } from './staff';

export interface TutorialStep {
  title: string;
  narration: string;
  caveat?: string;
  run?: () => void;
  fastForwardLabel?: string;
  fastForward?: () => void;
}

// Groundwork for the ATO tutorials (see the "Tutorial Flight Plan" brief's
// RT-T4/RT-T7 findings): CommandBarMenu.tsx groups the TUTORIALS list under
// its category rather than rendering one flat list, and required (not
// optional) specifically so a new tutorial can't be added without someone
// deciding where it belongs — the whole point is that this doesn't
// silently degrade back into an unsorted list as more get added.
export type TutorialCategory = 'Staff & Adjudication' | 'Air Tasking';
// Display order for CommandBarMenu.tsx's grouped list — not derived from
// TUTORIALS itself, so a category with zero tutorials in it yet (Air
// Tasking, until those are built) still has a defined place rather than
// only appearing once something exists to put there.
export const TUTORIAL_CATEGORIES: TutorialCategory[] = ['Staff & Adjudication', 'Air Tasking'];

export interface Tutorial {
  id: string;
  name: string;
  description: string;
  category: TutorialCategory;
  // At most one tutorial per category should set this — CommandBarMenu.tsx
  // doesn't enforce that, it just renders whichever one(s) do with a
  // "START HERE" tag, so a genuinely new user has a signal for which of a
  // growing list to click first.
  recommended?: boolean;
  steps: TutorialStep[];
  cleanup?: () => void;
}

const orgAcronym = (id: string) => ORGANIZATIONS.find((o) => o.id === id)?.acronym ?? id.toUpperCase();

const staffRolesTutorial: Tutorial = {
  id: 'staff-roles',
  name: 'Staff Roles & Organizations',
  description: 'How Meridian models who does the targeting process — roles, personnel, and the boards/bureaus/cells/centers/working groups they sit on.',
  category: 'Staff & Adjudication',
  recommended: true,
  steps: [
    {
      title: 'Welcome',
      narration:
        "This walks through the foundation for the Gaps 1/3/4/6 work: giving Meridian a real staff — roles, personnel, and the organizations that carry out the joint targeting process. Nothing in this first tutorial changes simulation behavior; it's the data the next tutorial, \"Board Adjudication Pilot,\" actually exercises.",
    },
    {
      title: 'Ten roles',
      narration: `Meridian now defines ten staff roles, matching the field guide's staff glossary:\n\n${ROLES.map((r) => `• ${r.label} — ${r.description}`).join('\n')}`,
      caveat: "These roles don't have their own manager panel in the app yet — you're seeing them through this tutorial, not a permanent Meridian screen.",
    },
    {
      title: 'Ten seats, one of them yours',
      narration: `Every role needs someone to hold it. Meridian seats ten entities:\n\n${STAFF.map((e) => `• ${e.name}${e.isUser ? ' (YOU)' : ''} — ${e.roles.map(roleLabel).join(', ')}`).join(
        '\n',
      )}\n\nOnly "YOU" is human-controlled today. Every NPC seat is built the same way, though — nothing about the data stops one from being handed to a second real user later.`,
      caveat: "There's no UI yet for reassigning a seat to a different person, or for a second human to join — that's future work, not built.",
      run: () => useStore.getState().setActiveManager('oob'),
    },
    {
      title: 'Six organizations',
      narration: `Those seats sit on six organizations — deliberately one of each kind you named (board, bureau, cell, center, working group):\n\n${ORGANIZATIONS.map(
        (o) => `• ${o.acronym} — ${o.name} (${o.kind}) — adjudication cadence ~${o.cadenceSeconds}s`,
      ).join('\n')}`,
    },
    {
      title: 'Who owns what',
      narration: `Every consequential action in Meridian now has a documented owner:\n\n${ACTION_ROUTING.map(
        (r) => `• ${r.action} → ${roleLabel(r.ownerRole)} @ ${orgAcronym(r.orgId)}${r.wired ? ' — LIVE' : ' — documented only'}`,
      ).join('\n')}`,
      caveat: 'Only toggleAppr:strike is actually enforced today (marked LIVE) — the rest still apply instantly. Routing the others the same way is future work, not built.',
    },
    {
      title: 'Next: watch it work',
      narration:
        'The "Board Adjudication Pilot" tutorial actually exercises this data: submitting a Strike Cell Concur request and watching the JTCB rule on it, with a real submitted-DTG and adjudicated-DTG.',
    },
  ],
};

const TARGET_ID = 'T2205';

interface ApprBaseline {
  pid: boolean;
  jag: boolean;
  strike: boolean;
}

const boardPilotTutorial: Tutorial = {
  id: 'board-pilot',
  name: 'Board Adjudication Pilot',
  description: 'Submit a Strike Cell Concur request for a live track and watch the JTCB actually adjudicate it — submitted-DTG, adjudicated-DTG, and a stated rationale.',
  category: 'Staff & Adjudication',
  steps: [
    {
      title: 'Setup',
      narration:
        "We'll submit a Strike Cell Concur request for 2205 BASTION and watch the Joint Targeting Coordination Board rule on it. First, opening its object card and the Target Workup tab — exactly what you'd click yourself.",
      run: () => {
        const s = useStore.getState();
        s.openCard(TARGET_ID);
        s.setCardTab(4);
      },
    },
    {
      title: 'Baseline conditions',
      narration:
        'Positive ID and ROE/JAG review both need to read TRUE before the board will approve anything. This step records exactly how 2205 BASTION stood before we touched it, then sets up a clean starting point — PID and JAG on, Strike Cell Concur off — so the walkthrough always has something to submit.',
      caveat:
        'In a real cell, PID comes from an ISR analyst and JAG review from the SJA — two different people, doing real work of their own. Here this tutorial sets both directly, since routing those two through their own boards (see the previous tutorial\'s "documented only" rows) is future work.',
      run: () => {
        const s = useStore.getState();
        const target = s.targets.find((t) => t.id === TARGET_ID);
        if (!target) return;
        const baseline: ApprBaseline = { pid: target.appr.pid, jag: target.appr.jag, strike: target.appr.strike };
        useStore.setState((prev) => ({ tutorialScratch: { ...prev.tutorialScratch, baseline } }));
        if (!target.appr.pid) s.toggleAppr('pid', TARGET_ID);
        if (!target.appr.jag) s.toggleAppr('jag', TARGET_ID);
        if (target.appr.strike) s.toggleAppr('strike', TARGET_ID);
      },
    },
    {
      title: 'Submit',
      narration: "Clicking STRIKE CELL CONCUR on an unapproved track no longer flips it instantly — it submits a request to the JTCB, with a submitted-DTG right now and an adjudication-DTG some real time later.",
      run: () => useStore.getState().submitApproval('strike', TARGET_ID),
    },
    {
      title: 'Pending',
      narration:
        'Look at the STRIKE CELL CONCUR row now, on either the object card or the Target Workup rail — amber, showing "JTCB · DUE <time>" instead of a plain checkbox. That due time is real: left alone, it will not resolve early.',
      caveat:
        "The JTCB's actual deliberation — five officers in a room, reviewing the packet — would happen outside Meridian entirely. Here it's a timer plus a rule check standing in for that meeting.",
      fastForwardLabel: "Fast-forward the JTCB's clock",
      fastForward: () => {
        const s = useStore.getState();
        const action = s.pendingActions.find((a) => a.targetId === TARGET_ID && a.kind === 'toggleAppr:strike' && a.status === 'pending');
        if (action) s.forceResolvePendingAction(action.id);
      },
    },
    {
      title: 'Ruling',
      narration:
        'The board has ruled — check the toast stack in the bottom-right of the center panel: one toast for the ruling itself, with the board\'s stated reasoning, and a second one right behind it for the JIPTL transition this approval triggers.',
    },
    {
      title: 'Wrap-up',
      narration:
        'That was the whole loop: submit → pending with real DTGs → adjudicate with a stated rationale → apply. Exiting this tutorial puts 2205 BASTION back exactly how it was before we started — including Strike Cell Concur, PID, and ROE/JAG, if this tutorial was the one that changed them.',
      caveat:
        'Not yet built: a chat thread where you could actually discuss the packet with the board before it rules (Gap 6); the other three approvals routed through a board the same way instead of applying instantly; and a real second person ever occupying one of the NPC seats.',
    },
  ],
  cleanup: () => {
    const s = useStore.getState();
    const baseline = s.tutorialScratch.baseline as ApprBaseline | undefined;
    const target = s.targets.find((t) => t.id === TARGET_ID);
    if (baseline && target) {
      if (target.appr.pid !== baseline.pid) s.toggleAppr('pid', TARGET_ID);
      if (target.appr.jag !== baseline.jag) s.toggleAppr('jag', TARGET_ID);
      if (target.appr.strike !== baseline.strike) s.toggleAppr('strike', TARGET_ID);
    }
    useStore.setState((prev) => ({
      pendingActions: prev.pendingActions.filter((a) => !(a.targetId === TARGET_ID && a.kind === 'toggleAppr:strike' && a.status === 'pending')),
    }));
  },
};

interface PidBaseline {
  pid: boolean;
}

const KITE_ID = 'T2204';
const VIPER_ID = 'T2201';

const adjudicationTransparencyTutorial: Tutorial = {
  id: 'adjudication-transparency',
  name: 'NPC Adjudication & Transparency',
  description: "Watch the same Positive ID rule land two different ways on two real tracks, each ruling credited by name — proof the adjudicator is a stated rule, not a black box.",
  category: 'Staff & Adjudication',
  steps: [
    {
      title: 'Welcome',
      narration:
        "The Board Adjudication Pilot showed one request going through one board. This walkthrough is about what backs that: every adjudicator is a plain, readable rule keyed to real target data, every ruling is credited to the actual role-holder who owns it — not just an org's nominal chair — and every ruling stays visible on the object card long after its toast has faded.",
    },
    {
      title: 'Setup — 2204 KITE',
      narration:
        "2204 KITE is an unresolved contact at 58% classification confidence — too low to establish Positive ID. Opening its object card and Target Workup tab, and recording its current PID state so this tutorial can restore it exactly on exit.",
      run: () => {
        const s = useStore.getState();
        s.openCard(KITE_ID);
        s.setCardTab(4);
        const target = s.targets.find((t) => t.id === KITE_ID);
        const baseline: PidBaseline = { pid: target?.appr.pid ?? false };
        useStore.setState((prev) => ({ tutorialScratch: { ...prev.tutorialScratch, kiteBaseline: baseline } }));
        if (target?.appr.pid) s.toggleAppr('pid', KITE_ID);
      },
    },
    {
      title: 'Submit — low confidence',
      narration:
        'Clicking POSITIVE ID submits a request to the Collection Management Board rather than flipping the checkbox instantly — same pattern as Strike Cell Concur, now generalized to this row too.',
      run: () => useStore.getState().submitApproval('pid', KITE_ID),
      fastForwardLabel: "Fast-forward the CMB's clock",
      fastForward: () => {
        const s = useStore.getState();
        const action = s.pendingActions.find((a) => a.targetId === KITE_ID && a.kind === 'toggleAppr:pid' && a.status === 'pending');
        if (action) s.forceResolvePendingAction(action.id);
      },
    },
    {
      title: 'Ruling — held',
      narration:
        'Switch to the OVERVIEW tab and look at ADJUDICATION HISTORY: the ruling is HELD, with the stated reason — classification confidence too low for a positive ID — and the name of the J2 officer who owns that call. That entry stays there; it is not just a toast that vanishes.',
      caveat:
        "The rule here is one line — confidence below 70%. A real J2 might weigh corroborating imagery or SIGINT that Meridian doesn't model yet, and there's no way from this card to hand the board more evidence and ask again.",
      run: () => useStore.getState().setCardTab(0),
    },
    {
      title: 'Setup — 2201 VIPER',
      narration:
        "2201 VIPER sits at 96% confidence but has never had PID submitted. Same rule, same board, a track where the data reads the other way — recording its baseline the same way before touching it.",
      run: () => {
        const s = useStore.getState();
        s.openCard(VIPER_ID);
        s.setCardTab(4);
        const target = s.targets.find((t) => t.id === VIPER_ID);
        const baseline: PidBaseline = { pid: target?.appr.pid ?? false };
        useStore.setState((prev) => ({ tutorialScratch: { ...prev.tutorialScratch, viperBaseline: baseline } }));
        if (target?.appr.pid) s.toggleAppr('pid', VIPER_ID);
      },
    },
    {
      title: 'Submit — high confidence',
      narration: 'Submitting Positive ID for 2201 VIPER — same board, same rule, same officer on the roster.',
      run: () => useStore.getState().submitApproval('pid', VIPER_ID),
      fastForwardLabel: "Fast-forward the CMB's clock",
      fastForward: () => {
        const s = useStore.getState();
        const action = s.pendingActions.find((a) => a.targetId === VIPER_ID && a.kind === 'toggleAppr:pid' && a.status === 'pending');
        if (action) s.forceResolvePendingAction(action.id);
      },
    },
    {
      title: 'Ruling — approved',
      narration:
        "APPROVED this time, same rule, same named officer — the outcome changed because VIPER's data did, not because the rule was bent for it. That's the point of a stated, one-line rule: you can tell in advance which way it will go, and see exactly why after.",
    },
    {
      title: 'Wrap-up',
      narration:
        'Two tracks, one rule, two different rulings, both durably recorded and both correctly attributed. Exiting this tutorial restores 2204 KITE and 2201 VIPER to the PID state they were in before it started.',
      caveat:
        "Not yet built: appealing or supplementing a HELD ruling — that needs a real conversation with the board, which is Gap 6 (chat), not built yet. The other adjudicators (JAG, Strike, TEA, target nomination) follow this same pattern; see the Nomination & the Final Gate tutorial.",
    },
  ],
  cleanup: () => {
    const s = useStore.getState();
    const kiteBaseline = s.tutorialScratch.kiteBaseline as PidBaseline | undefined;
    const kite = s.targets.find((t) => t.id === KITE_ID);
    if (kiteBaseline && kite && kite.appr.pid !== kiteBaseline.pid) s.toggleAppr('pid', KITE_ID);
    const viperBaseline = s.tutorialScratch.viperBaseline as PidBaseline | undefined;
    const viper = s.targets.find((t) => t.id === VIPER_ID);
    if (viperBaseline && viper && viper.appr.pid !== viperBaseline.pid) s.toggleAppr('pid', VIPER_ID);
    useStore.setState((prev) => ({
      pendingActions: prev.pendingActions.filter(
        (a) => !((a.targetId === KITE_ID || a.targetId === VIPER_ID) && a.kind === 'toggleAppr:pid' && a.status === 'pending'),
      ),
    }));
  },
};

interface PriBaseline {
  pri: number | null;
}

interface TeaBaseline {
  tea: boolean;
}

const FORGE_ID = 'T2198';
const DRIFT_ID = 'T2210';
const REEF_ID = 'T2203';

const nominationAndFinalGateTutorial: Tutorial = {
  id: 'nomination-final-gate',
  name: 'Nomination & the Final Gate',
  description: 'Nominate an unprioritized track for the HPTL, watch one get approved and one get held, then close the whole approval chain by granting Target Engagement Authority.',
  category: 'Staff & Adjudication',
  steps: [
    {
      title: 'Welcome',
      narration:
        'Step 5 generalized the pending-action pattern two more directions: Positive ID, JAG review, and Target Engagement Authority now all route through their own board or bureau exactly like Strike Cell Concur already did, and a target can now be formally nominated for the HPTL instead of arriving on it pre-ranked.',
    },
    {
      title: 'Setup — 2198 FORGE',
      narration:
        "2198 FORGE is a confirmed hostile, high-threat track that has never been prioritized — no rank, so it doesn't sit on the HPTL yet. Opening its object card on OVERVIEW and recording its current priority so this tutorial can restore it exactly.",
      run: () => {
        const s = useStore.getState();
        s.openCard(FORGE_ID);
        s.setCardTab(0);
        const target = s.targets.find((t) => t.id === FORGE_ID);
        const baseline: PriBaseline = { pri: target?.pri ?? null };
        useStore.setState((prev) => ({ tutorialScratch: { ...prev.tutorialScratch, forgeBaseline: baseline } }));
      },
    },
    {
      title: 'Nominate — 2198 FORGE',
      narration:
        'Look for "▸ NOMINATE FOR PRIORITIZATION (HPTL)" under the target lists row — it only appears on a track with no priority rank yet. Clicking it submits the nomination to the Joint Targeting Working Group instead of ranking the target directly.',
      run: () => useStore.getState().submitTargetNomination(FORGE_ID),
      fastForwardLabel: "Fast-forward the JTWG's clock",
      fastForward: () => {
        const s = useStore.getState();
        const action = s.pendingActions.find((a) => a.targetId === FORGE_ID && a.kind === 'nominateTarget' && a.status === 'pending');
        if (action) s.forceResolvePendingAction(action.id);
      },
    },
    {
      title: 'Ruling — approved',
      narration:
        'FORGE is hostile, carries a threat assessment, and had no existing rank — the JTWG approves, and it now holds a real priority number and shows the HPTL badge. Check ADJUDICATION HISTORY for the stated reasoning and the named J2 officer who consolidated the nomination.',
    },
    {
      title: 'Setup — 2210 DRIFT',
      narration:
        "2210 DRIFT is also unranked, but it's a neutral contact, not a hostile one. Same nomination workflow, different data — opening its card and recording its baseline the same way.",
      run: () => {
        const s = useStore.getState();
        s.openCard(DRIFT_ID);
        s.setCardTab(0);
        const target = s.targets.find((t) => t.id === DRIFT_ID);
        const baseline: PriBaseline = { pri: target?.pri ?? null };
        useStore.setState((prev) => ({ tutorialScratch: { ...prev.tutorialScratch, driftBaseline: baseline } }));
      },
    },
    {
      title: 'Nominate — 2210 DRIFT',
      narration: 'Submitting the same nomination for a neutral-affiliation track.',
      run: () => useStore.getState().submitTargetNomination(DRIFT_ID),
      fastForwardLabel: "Fast-forward the JTWG's clock",
      fastForward: () => {
        const s = useStore.getState();
        const action = s.pendingActions.find((a) => a.targetId === DRIFT_ID && a.kind === 'nominateTarget' && a.status === 'pending');
        if (action) s.forceResolvePendingAction(action.id);
      },
    },
    {
      title: 'Ruling — held',
      narration:
        'HELD — a neutral contact does not meet high-payoff target criteria no matter how it scores on anything else. Same working group, same rule, same transparent rationale in ADJUDICATION HISTORY, and DRIFT still carries no priority rank.',
      caveat: 'A real JTWG could still flag a neutral contact for something other than the HPTL — collection, deconfliction, watchlisting. Meridian only models the one nomination outcome today.',
    },
    {
      title: 'Setup — 2203 REEF, the final gate',
      narration:
        "2203 REEF already has Positive ID, JAG review, and Strike Cell Concur on file — every gate before the last one. Opening its Target Workup tab to watch the chain close with Target Engagement Authority, and recording its current TEA state.",
      run: () => {
        const s = useStore.getState();
        s.openCard(REEF_ID);
        s.setCardTab(4);
        const target = s.targets.find((t) => t.id === REEF_ID);
        const baseline: TeaBaseline = { tea: target?.appr.tea ?? false };
        useStore.setState((prev) => ({ tutorialScratch: { ...prev.tutorialScratch, reefBaseline: baseline } }));
      },
    },
    {
      title: 'Submit — Target Engagement Authority',
      narration:
        'Clicking TARGET ENGAGEMENT AUTHORITY submits to the JTCB — the same board that ruled on Strike Cell Concur, but this rule checks that PID, JAG, and Strike Cell Concur are already all true before it will approve anything.',
      run: () => useStore.getState().submitApproval('tea', REEF_ID),
      fastForwardLabel: "Fast-forward the JTCB's clock",
      fastForward: () => {
        const s = useStore.getState();
        const action = s.pendingActions.find((a) => a.targetId === REEF_ID && a.kind === 'toggleAppr:tea' && a.status === 'pending');
        if (action) s.forceResolvePendingAction(action.id);
      },
    },
    {
      title: 'Ruling — chain closed',
      narration:
        'Approved — and look at who it is credited to: the JTCB Chair, not the J3 who concurs on Strike. Different rows in the same board resolve to different named seats, because the routing follows the actual role that owns each action, not just whoever chairs the meeting.',
    },
    {
      title: 'Wrap-up',
      narration:
        'Five action kinds now run through this same submit → pending-with-DTGs → adjudicate-with-a-stated-rule → apply pipeline: Positive ID, JAG review, Strike Cell Concur, Target Engagement Authority, and target nomination. Exiting restores FORGE, DRIFT, and REEF exactly as they stood before this tutorial started.',
      caveat:
        "Still documented-only, not wired: ROE cycling, sensor retasking, effector assignment, dynamic engagement, and contact-identity assignment (see the Staff Roles tutorial's routing table). And there is still no way to contest a HELD ruling from inside the app — that discussion is Gap 6, not built.",
    },
  ],
  cleanup: () => {
    const s = useStore.getState();
    const forgeBaseline = s.tutorialScratch.forgeBaseline as PriBaseline | undefined;
    const forge = s.targets.find((t) => t.id === FORGE_ID);
    if (forgeBaseline && forge && forge.pri !== forgeBaseline.pri) s.clearPriority(FORGE_ID);
    const driftBaseline = s.tutorialScratch.driftBaseline as PriBaseline | undefined;
    const drift = s.targets.find((t) => t.id === DRIFT_ID);
    if (driftBaseline && drift && drift.pri !== driftBaseline.pri) s.clearPriority(DRIFT_ID);
    const reefBaseline = s.tutorialScratch.reefBaseline as TeaBaseline | undefined;
    const reef = s.targets.find((t) => t.id === REEF_ID);
    if (reefBaseline && reef && reef.appr.tea !== reefBaseline.tea) s.toggleAppr('tea', REEF_ID);
    useStore.setState((prev) => ({
      pendingActions: prev.pendingActions.filter(
        (a) =>
          !(
            ((a.targetId === FORGE_ID || a.targetId === DRIFT_ID) && a.kind === 'nominateTarget' && a.status === 'pending') ||
            (a.targetId === REEF_ID && a.kind === 'toggleAppr:tea' && a.status === 'pending')
          ),
      ),
    }));
  },
};

const TANGENT_ID = 'T2209';

const boardCommsTutorial: Tutorial = {
  id: 'board-comms',
  name: 'Board Communications',
  description:
    'Message a board directly about a live request — one that gets approved, one that gets held — and get back an answer that is always a real lookup over the same pending-action data the rest of Meridian shows, never an invented reply.',
  category: 'Staff & Adjudication',
  steps: [
    {
      title: 'Welcome',
      narration:
        'Gap 4 was chat, scoped to an organization or a specific pending action. This walks through the result: a message thread with a board that answers with real status, not a canned conversation — the same "never a black box" rule the adjudicators already follow.',
    },
    {
      title: 'Setup',
      narration:
        'Setting up 2205 BASTION exactly like the Board Adjudication Pilot did — Positive ID and ROE/JAG review on, Strike Cell Concur off — then submitting Strike Cell Concur so there is a live request at the JTCB to actually ask about.',
      run: () => {
        const s = useStore.getState();
        s.openCard(TARGET_ID);
        s.setCardTab(4);
        const target = s.targets.find((t) => t.id === TARGET_ID);
        if (!target) return;
        const baseline: ApprBaseline = { pid: target.appr.pid, jag: target.appr.jag, strike: target.appr.strike };
        useStore.setState((prev) => ({ tutorialScratch: { ...prev.tutorialScratch, baseline } }));
        if (!target.appr.pid) s.toggleAppr('pid', TARGET_ID);
        if (!target.appr.jag) s.toggleAppr('jag', TARGET_ID);
        if (target.appr.strike) s.toggleAppr('strike', TARGET_ID);
        s.submitApproval('strike', TARGET_ID);
      },
    },
    {
      title: 'Ask about it',
      narration:
        'Clicking "▸ DISCUSS" next to a pending row opens Board Comms already scoped to that board and that target — the "RE:" line under the thread shows it. Sending a message now gets a real answer back: the request is still on the board\'s clock, with the same due time shown on the card itself.',
      run: () => {
        const s = useStore.getState();
        s.openChat('jtcb', TARGET_ID);
        s.sendChatMessage('Any update on Strike Cell Concur?');
      },
    },
    {
      title: 'Wait for the ruling',
      narration:
        "The board hasn't ruled yet, so there's nothing new to ask it. Fast-forward the JTCB's clock here, then move to the next step to ask again — asking before the ruling would just get the same \"still on our board\" answer a second time.",
      fastForwardLabel: "Fast-forward the JTCB's clock",
      fastForward: () => {
        const s = useStore.getState();
        const action = s.pendingActions.find((a) => a.targetId === TARGET_ID && a.kind === 'toggleAppr:strike' && a.status === 'pending');
        if (action) s.forceResolvePendingAction(action.id);
      },
    },
    {
      title: 'Ask again — approved',
      narration: "Now that the JTCB has actually ruled, asking again gets a different answer — the board's stated rationale, word for word the same text that lands in the toast and in ADJUDICATION HISTORY.",
      run: () => useStore.getState().sendChatMessage('So what happened with that?'),
    },
    {
      title: 'A second request, this one held',
      narration:
        "2209 TANGENT has never had Positive ID or ROE/JAG review submitted at all — submitting Strike Cell Concur for it anyway gives the JTCB a request it cannot approve. Opening its Target Workup tab and submitting Strike Cell Concur straight away, with nothing forced first.",
      run: () => {
        const s = useStore.getState();
        s.openCard(TANGENT_ID);
        s.setCardTab(4);
        s.submitApproval('strike', TANGENT_ID);
        s.openChat('jtcb', TANGENT_ID);
        s.sendChatMessage('What about this one?');
      },
    },
    {
      title: 'Wait for the ruling — held',
      narration: "Same as before — nothing to ask yet. Fast-forward the JTCB's clock, then move on to ask again.",
      fastForwardLabel: "Fast-forward the JTCB's clock",
      fastForward: () => {
        const s = useStore.getState();
        const action = s.pendingActions.find((a) => a.targetId === TANGENT_ID && a.kind === 'toggleAppr:strike' && a.status === 'pending');
        if (action) s.forceResolvePendingAction(action.id);
      },
    },
    {
      title: 'Ask again — held',
      narration:
        "This time the answer is HELD, with the actual reasons — the same two conditions the AUTHORIZATION grid already shows unmet for this track. A rejected ruling never touches the target's approvals, so there is nothing for this tutorial to undo where TANGENT is concerned.",
      run: () => useStore.getState().sendChatMessage('And this one?'),
    },
    {
      title: 'Ask more generally',
      narration:
        'Clearing the "RE:" scope and asking a general question gets a different kind of answer — a summary of everything actually pending at this board right now, rather than one target\'s status.',
      run: () => {
        const s = useStore.getState();
        s.setChatTargetScope(null);
        s.sendChatMessage('Anything else on your plate?');
      },
    },
    {
      title: 'Wrap-up',
      narration:
        'One request approved, one held, both answered the same honest way: every reply in this thread was a lookup over real pendingActions state, not a generated conversation — ask the same question twice at the same moment and you get the same answer, because there is only one true answer to look up. Exiting restores 2205 BASTION and this thread to how they stood before.',
      caveat:
        "Not yet built: a real back-and-forth where you could submit new evidence and have it change a ruling, or a second human occupying an NPC seat and typing real replies instead of a rule-based lookup. Discussing a HELD ruling here only tells you the same rationale already on the card — it can't yet change the outcome.",
    },
  ],
  cleanup: () => {
    const s = useStore.getState();
    const baseline = s.tutorialScratch.baseline as ApprBaseline | undefined;
    const target = s.targets.find((t) => t.id === TARGET_ID);
    if (baseline && target) {
      if (target.appr.pid !== baseline.pid) s.toggleAppr('pid', TARGET_ID);
      if (target.appr.jag !== baseline.jag) s.toggleAppr('jag', TARGET_ID);
      if (target.appr.strike !== baseline.strike) s.toggleAppr('strike', TARGET_ID);
    }
    useStore.setState((prev) => ({
      pendingActions: prev.pendingActions.filter((a) => !(a.targetId === TARGET_ID && a.kind === 'toggleAppr:strike' && a.status === 'pending')),
    }));
  },
};

// The five ATO tutorials — "Tutorial Flight Plan" brief, built on the
// groundwork that brief's §V called for: atoDay is derived live (never
// stored), so no step below narrates a day-label without also driving to
// the sortie by id; TutorialSnapshot now covers selectedAtoDay/
// sortieMissionTypeFilter/showFlightLines/showAcoOverlay/focusedNaiId, so
// none of these five need a custom cleanup() — the generic snapshot
// restore in store.ts already reverts every field any step here touches.
// Unlike the Staff & Adjudication tutorials, nothing here submits a
// pending action, so none of these have a fastForward step either — nothing
// in the ATO work has a real-time adjudication delay to fast-forward past.
const atoBasicsTutorial: Tutorial = {
  id: 'ato-basics',
  name: 'Air Tasking Order Basics',
  description: 'Where the flight schedule lives, and what "D-3 to D+3" actually means — the on-ramp for every other ATO tutorial.',
  category: 'Air Tasking',
  recommended: true,
  steps: [
    {
      title: 'Welcome',
      narration:
        "Meridian tracks more than this instant now — sorties flown over the last three days, and sorties planned for the next three. This walks through where that lives and what the vocabulary means, before any of the other Air Tasking tutorials build on it.",
    },
    {
      title: 'One clock, two directions',
      narration:
        "Real air campaigns run on a rolling cycle: today's flying, tomorrow's is being built, the day after that is still being planned. Yesterday's flying — and the two days before it — are being graded on what they actually achieved. That grading has three stages of its own (PDA, then FDA, then TSA), covered in full in \"Reading a Sortie.\" Opening the AIR TASKING panel now — the icon below ISR COLLECTION in the far-left sidebar.",
      run: () => useStore.getState().setActiveManager('ato'),
    },
    {
      title: 'The AIR TASKING panel, left to right',
      narration:
        "Seven boxes across the top, D-3 to D+3, each showing a phase label (ASSESSING/EXECUTION/PRODUCTION/PLANNING) and how many sorties fall on it. D0 — today, in execution — is selected now. Clicking any other box re-scopes everything below it: the mission-type filter and the sortie list.",
      run: () => useStore.getState().setSelectedAtoDay('D0'),
    },
    {
      title: "Mission types aren't all strikes",
      narration:
        'The row of chips under the day strip filters by mission type. Selecting AAR — air-to-air refueling — on purpose: most of what a real ATO tasks is not kinetic at all.',
      caveat: "AAR sorties (like TEXACO-3 below) don't have a map location the way a target-linked strike does — covered honestly in \"Reading a Sortie\" and \"Flight Lines & Airspace,\" not hidden here.",
      run: () => useStore.getState().setSortieMissionTypeFilter('AAR'),
    },
    {
      title: 'Open one',
      narration:
        'Clicking a row opens that sortie\'s own card — clearing the filter first, then opening HORNET-21\'s SEAD line. Its four tabs (OVERVIEW, LINKAGE, ROUTE, BDA) are "Reading a Sortie," next.',
      run: () => {
        const s = useStore.getState();
        s.setSortieMissionTypeFilter('ALL');
        s.openEntity('sortie', 'ALPHA-01');
      },
    },
    {
      title: 'Wrap-up',
      narration:
        'The AIR TASKING panel: a rolling seven-day window, a mission-type filter, and a list that opens into the sortie card itself. "Reading a Sortie" picks up exactly there.',
    },
  ],
};

const readingASortieTutorial: Tutorial = {
  id: 'reading-a-sortie',
  name: 'Reading a Sortie',
  description: 'The four-tab card, and the one real historical example Meridian has of a sortie that\'s actually finished.',
  category: 'Air Tasking',
  steps: [
    {
      title: 'Welcome',
      narration:
        'Every sortie card answers four questions, one per tab: what flew (OVERVIEW), what it was for (LINKAGE), where it went (ROUTE), and what happened (BDA).',
    },
    {
      title: 'OVERVIEW — a currently-flying example',
      narration:
        "VENOM-1's strike line, still AIRBORNE: callsign, platform, mission type, package, status, which ATO day it falls on, and its time-over-target window — all read straight off the sortie, nothing summarized or rounded.",
      run: () => {
        const s = useStore.getState();
        s.setActiveManager('ato');
        s.setSelectedAtoDay('D0');
        s.openEntity('sortie', 'ALPHA-02');
      },
    },
    {
      title: "LINKAGE — not every sortie has a target",
      narration:
        "VENOM-1 is linked to one target (2202 ANVIL) — but LINKAGE has two other sections: SUPPORTS (what a tanker or AEW sortie is refueling or covering, not striking) and COLLECTION REQUIREMENTS (what an ISR sortie is tasked to watch). A given sortie only ever fills in the section that actually applies to it.",
      run: () => useStore.getState().setCardTab(1),
    },
    {
      title: 'ROUTE — honest about what\'s not there yet',
      narration:
        'Origin and recovery airfield, by name. That\'s all this tab has today.',
      caveat: "These names aren't linked to real airfield map features yet for a sortie with no target — an AAR, AEW, or most ISR lines round-trip the same airfield with nothing to draw a route through. Covered on the map itself in \"Flight Lines & Airspace.\"",
      run: () => useStore.getState().setCardTab(2),
    },
    {
      title: 'Switch example — a finished strike',
      narration:
        "Opening VIPER-19's card directly by callsign, not by clicking around for it — the one sortie in this fixture set that's actually COMPLETE, from yesterday's ATO day.",
      run: () => {
        const s = useStore.getState();
        s.setSelectedAtoDay('D-1');
        s.openEntity('sortie', 'BRAVO-01');
        s.setCardTab(3);
      },
    },
    {
      title: 'BDA — three questions, not one',
      narration:
        "Combat assessment is three separate calls, left to right: PDA (was the aimpoint actually hit?), FDA (did the target lose the capability it had?), and TSA (what's the effect on the wider system it belongs to?). VIPER-19's strike reads PDA ASSESSED (green, confirmed hit) but FDA INCONCLUSIVE (amber) — read the note underneath for why, in plain language.",
    },
    {
      title: 'Wrap-up',
      narration:
        'Four tabs, four questions. FDA reading INCONCLUSIVE here is not a loose end — "Reattack: When BDA Isn\'t Done" is what Meridian actually does with that fact.',
    },
  ],
};

const flightLinesAirspaceTutorial: Tutorial = {
  id: 'flight-lines-airspace',
  name: 'Flight Lines & Airspace',
  description: 'Turning on the two map toggles, and why some sorties still don\'t draw a line.',
  category: 'Air Tasking',
  steps: [
    {
      title: 'Welcome',
      narration:
        'Two toggles in the command bar, top-right of the map, next to ALT: FLT (flight lines) and ACO (airspace control). Both default off — a fully-drawn air picture on top of everything else Meridian already puts on the map gets crowded fast, so both are opt-in.',
    },
    {
      title: 'FLT — turn it on',
      narration:
        "Switching to today's ATO day, then turning on FLT. Lines now appear for sorties with somewhere real to draw a route to — solid for a sortie that's flown or is flying, dashed for one still only fragged.",
      run: () => {
        const s = useStore.getState();
        s.setSelectedAtoDay('D0');
        s.setShowFlightLines(true);
      },
    },
    {
      title: 'A finished leg looks different',
      narration:
        "Switching to yesterday's ATO day: VIPER-19's line is a real recorded track — a multi-point path actually flown, not a straight-line guess — because it's the one sortie in this fixture set with real flight history behind it. Every other line on the map today is an approximation: origin, straight to the linked target, straight to recovery.",
      run: () => useStore.getState().setSelectedAtoDay('D-1'),
    },
    {
      title: 'Why some sorties draw nothing',
      narration:
        "Back to today. TEXACO-3's tanker line isn't on the map at all, and it's not a bug: it launches and recovers at the same airfield with no linked target, so there's no resolvable route to draw yet — the same gap ROUTE's caveat in \"Reading a Sortie\" already named. HORNET-21's SEAD line, from the last tutorial, does draw — it round-trips that same airfield too, but it has a linked target to draw a route through.",
      run: () => useStore.getState().setSelectedAtoDay('D0'),
    },
    {
      title: 'ACO — the airspace structure underneath',
      narration:
        "Turning on ACO: a Restricted Operations Zone box around where package ALPHA is working, and a tanker track corridor — the airspace structure every sortie flies inside of, published alongside the ATO the same way in real air operations. Unlike the flight lines, this isn't scoped to a day at all — it's standing structure, not something tied to today's tasking.",
      run: () => useStore.getState().setShowAcoOverlay(true),
    },
    {
      title: 'Wrap-up',
      narration:
        'FLT and ACO both switch back off once this tutorial exits, same as they were before it started — turn them on yourself from the command bar whenever you actually want the overlay.',
    },
  ],
};

const cpclCollectionPlanTutorial: Tutorial = {
  id: 'cpcl-collection-plan',
  name: 'Collection Plan & the CPCL',
  description: 'The ISR manager\'s missing half — what\'s being asked for, not just what\'s watching.',
  category: 'Air Tasking',
  steps: [
    {
      title: 'Welcome',
      narration:
        'The ISR manager already shows sensors and Named Areas of Interest — where collection is actually looking. Below that is the CPCL: what those areas actually need collected against, whether or not anything is currently tasked to do it.',
      run: () => useStore.getState().setActiveManager('isr'),
    },
    {
      title: 'A requirement, read top to bottom',
      narration:
        'Each CPCL row: a priority number, the intelligence requirement it traces to, a plain-language description, and a status — COLLECTING (green, something is on it right now), TASKED (amber, assigned but not yet on station), or UNTASKED (red). UNTASKED is a real, useful thing to be able to see — a need with nothing yet assigned against it.',
    },
    {
      title: "From the NAI's side",
      narration:
        'Clicking NAI-3 in the list above focuses the CPCL below it to just that NAI\'s requirement — CPCL-03 stays at full brightness, everything else dims. "What does this NAI need" is one click away from the NAI itself.',
      run: () => useStore.getState().setFocusedNaiId('NAI-3'),
    },
    {
      title: "From the requirement's side",
      narration:
        'CPCL-03 reads COLLECTING, with a chip underneath naming HAWK-01 — clicking it opens that sortie\'s own card directly, the reverse link: from "what\'s needed" straight to "what\'s doing it."',
      run: () => useStore.getState().openEntity('sortie', 'ISR-D0-1'),
    },
    {
      title: 'Wrap-up',
      narration:
        "In doctrine terms, this list is a CPCL — a Component Prioritized Collection List — the collection side's version of the target lists (JTL/JIPTL) already in Meridian. Exiting clears the NAI-3 focus and closes this card, back to how the ISR manager stood before.",
    },
  ],
};

const REATTACK_TARGET_ID = 'T2198';
const reattackTutorial: Tutorial = {
  id: 'reattack-recommendation',
  name: "Reattack: When BDA Isn't Done",
  description: 'The one feature that ties Sortie, Target, and the HPTL back together — and the biggest "aha" in the Air Tasking set.',
  category: 'Air Tasking',
  steps: [
    {
      title: 'Welcome',
      narration: "What happens when a strike doesn't finish the job? This is the one Air Tasking tutorial that reaches back into the targeting workflow the Staff & Adjudication tutorials cover.",
    },
    {
      title: 'Recall the ladder',
      narration:
        "Reopening VIPER-19's BDA tab from \"Reading a Sortie\": FDA reads INCONCLUSIVE, and the note says reattack is recommended next cycle. That single flag — reattackRecommended — is what the rest of this tutorial follows.",
      run: () => {
        const s = useStore.getState();
        s.setSelectedAtoDay('D-1');
        s.openEntity('sortie', 'BRAVO-01');
        s.setCardTab(3);
      },
    },
    {
      title: 'The target it hit',
      narration: "Opening 2198 FORGE's own card — the same strike, from the target's side instead of the sortie's.",
      run: () => useStore.getState().openEntity('target', REATTACK_TARGET_ID),
    },
    {
      title: 'Still on the HPTL — on purpose',
      narration:
        'FORGE carries no priority rank and reads NEUTRALIZED, yet it sits on the High-Payoff Target List with a ⚠ REATTACK badge in place of its usual status — because of that reattack flag, not despite it.',
      caveat:
        'If you\'ve run "Nomination & the Final Gate," that tutorial put FORGE on the HPTL a different way — an approved priority rank. Both are real, independent reasons the same list can hold a target; one doesn\'t cancel the other out.',
      run: () => useStore.getState().setActiveListId('hptl'),
    },
    {
      title: 'The workup panel says so too',
      narration:
        "Look at the right-rail TARGET WORKUP panel: instead of a plain green \"TARGET COMPLETE,\" it reads \"⚠ REATTACK RECOMMENDED,\" amber, with the same BDA note from VIPER-19's card. One fact, surfaced everywhere a HPTL-relevant decision gets made.",
    },
    {
      title: 'Wrap-up',
      narration:
        'One sortie\'s BDA, followed all the way through to a target staying on the working priority list and its workup panel changing state to say so.',
      caveat:
        'Acting on the recommendation isn\'t automated — there\'s no "reattack" button. An analyst notices the badge and manually walks the target back through the existing REGRESS control to reopen the engagement chain.',
    },
  ],
};

export const TUTORIALS: Tutorial[] = [
  staffRolesTutorial,
  boardPilotTutorial,
  adjudicationTransparencyTutorial,
  nominationAndFinalGateTutorial,
  boardCommsTutorial,
  atoBasicsTutorial,
  readingASortieTutorial,
  flightLinesAirspaceTutorial,
  cpclCollectionPlanTutorial,
  reattackTutorial,
];
