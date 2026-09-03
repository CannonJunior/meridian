// Catalog of "an action happened" trigger points a user can subscribe a
// custom notification to (NotificationCenterManager.tsx's "create a new
// notification" feature). Each entry names one real client-originated
// event — see the reportManagerAction call site named in its own
// description — that is relayed through POST /api/manager-actions
// (server/src/index.ts) to server/src/notifications.ts's
// publishNotification with scope: 'broadcast', so every connected browser
// (including the one that performed the action) receives it; store.ts's
// notificationTypeEnabled then gates delivery per-browser on whether that
// browser has actually created a NotificationRule for this id — an unknown
// type defaults off, so this catalog entry existing alone notifies nobody
// until a rule exists for it.
export interface ManagerActionInfo {
  id: string; // stable id — becomes notification type `action:${id}`
  managerLabel: string; // which manager/tool this originates from
  label: string;
  description: string;
}

export const MANAGER_ACTIONS: ManagerActionInfo[] = [
  {
    id: 'drawing-tool.shape-added',
    managerLabel: 'Drawing Tool',
    label: 'Shape Added',
    description: 'A user saves a new drawn shape (outline or reporting point) to a port, airfield, or OOB object — see DrawingToolManager.tsx handleSave.',
  },
  {
    id: 'chat.message-sent',
    managerLabel: 'Board Comms',
    label: 'Chat Message Sent',
    description: 'A user sends a new message in a Board Comms organization thread — see ChatManager.tsx submit.',
  },
  {
    id: 'workflow.action-submitted',
    managerLabel: 'Targeting Workflow',
    label: 'Action Submitted for Adjudication',
    description: 'A user submits an approval gate or target nomination to its owning organization for adjudication — see store.ts submitPendingAction.',
  },
];
