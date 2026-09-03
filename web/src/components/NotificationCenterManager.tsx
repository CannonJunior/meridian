import { useEffect, useState } from 'react';
import { useStore, NOTIFICATION_TYPES, notificationTypeEnabled } from '../store';
import type { AppNotification, NotificationRule } from '../store';
import { MANAGER_ACTIONS } from '../assets/managerActions';
import { fmtRealDTG } from '../selectors';
import ManagerHeader from './ManagerHeader';
import { ClickableDiv, ClickableSpan } from './Clickable';

function priorityColor(priority: AppNotification['priority']): string {
  return priority === 'critical' ? 'var(--red-crit)' : priority === 'normal' ? 'var(--amber)' : 'var(--cyan)';
}

function GearIcon({ color }: { color: string }) {
  return (
    <svg className="notification-center-settings-glyph" width="14" height="14" viewBox="0 0 20 20" fill="none">
      <circle className="notification-center-settings-glyph-hub" cx="10" cy="10" r="2.6" stroke={color} strokeWidth="1.4" />
      <path
        className="notification-center-settings-glyph-teeth"
        d="M10 3.2V5M10 15V16.8M16.8 10H15M5 10H3.2M14.8 5.2L13.6 6.4M6.4 13.6L5.2 14.8M14.8 14.8L13.6 13.6M6.4 6.4L5.2 5.2"
        stroke={color}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

// Category display order — first appearance in NOTIFICATION_TYPES, which
// is itself grouped by category already (see store.ts), so this just
// dedupes rather than imposing its own ordering.
const NOTIFICATION_CATEGORIES = Array.from(new Set(NOTIFICATION_TYPES.map((n) => n.category)));

// One row per known notification type (NOTIFICATION_TYPES in store.ts),
// grouped under its category. Same checkbox-row look as
// ContextLayerManager's layer toggles, for a consistent "list of on/off
// things" convention across managers.
function NotificationTypeRow({ type, label, description }: { type: string; label: string; description: string }) {
  const enabled = useStore((s) => notificationTypeEnabled(s.notificationTypePrefs, type));
  const setNotificationTypeEnabled = useStore((s) => s.setNotificationTypeEnabled);

  return (
    <ClickableDiv
      className="notification-center-settings-row"
      onClick={() => setNotificationTypeEnabled(type, !enabled)}
      style={{ border: `1px solid ${enabled ? '#4a1f24' : 'var(--hairline-mid)'}`, background: enabled ? 'rgba(230,80,90,.05)' : 'var(--panel-3)', padding: '8px 9px', cursor: 'pointer' }}
    >
      <div className="notification-center-settings-row-header" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          className="notification-center-settings-row-checkbox"
          style={{
            width: 13,
            height: 13,
            border: `1.5px solid ${enabled ? 'var(--red-crit)' : 'var(--ink-faint)'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 9,
            color: 'var(--red-crit)',
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {enabled ? '✓' : ''}
        </span>
        <span className="notification-center-settings-row-label" style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 600, letterSpacing: '.02em', color: enabled ? 'var(--ink-bright)' : 'var(--ink-mute)' }}>
          {label}
        </span>
      </div>
      <div className="notification-center-settings-row-description" style={{ fontSize: 9, color: 'var(--ink-mute2)', marginTop: 4, lineHeight: 1.4, paddingLeft: 21 }}>
        {description}
      </div>
    </ClickableDiv>
  );
}

// One row per user-created NotificationRule — same checkbox-row look as
// NotificationTypeRow above, plus a delete control since (unlike the
// developer-curated NOTIFICATION_TYPES) the user owns these and can remove
// them entirely, not just toggle them off.
function CustomRuleRow({ rule }: { rule: NotificationRule }) {
  const type = `action:${rule.actionId}`;
  const enabled = useStore((s) => notificationTypeEnabled(s.notificationTypePrefs, type));
  const setNotificationTypeEnabled = useStore((s) => s.setNotificationTypeEnabled);
  const removeNotificationRule = useStore((s) => s.removeNotificationRule);
  const info = MANAGER_ACTIONS.find((a) => a.id === rule.actionId);

  return (
    <div
      className="notification-center-custom-rule-row"
      style={{ display: 'flex', alignItems: 'flex-start', gap: 6, border: `1px solid ${enabled ? '#4a1f24' : 'var(--hairline-mid)'}`, background: enabled ? 'rgba(230,80,90,.05)' : 'var(--panel-3)', padding: '8px 9px' }}
    >
      <ClickableDiv className="notification-center-custom-rule-toggle" onClick={() => setNotificationTypeEnabled(type, !enabled)} style={{ flex: 1, cursor: 'pointer', minWidth: 0 }}>
        <div className="notification-center-custom-rule-header" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            className="notification-center-custom-rule-checkbox"
            style={{ width: 13, height: 13, border: `1.5px solid ${enabled ? 'var(--red-crit)' : 'var(--ink-faint)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: 'var(--red-crit)', fontWeight: 700, flexShrink: 0 }}
          >
            {enabled ? '✓' : ''}
          </span>
          <span className="notification-center-custom-rule-label" style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 600, letterSpacing: '.02em', color: enabled ? 'var(--ink-bright)' : 'var(--ink-mute)' }}>
            {rule.label}
          </span>
        </div>
        <div className="notification-center-custom-rule-description" style={{ fontSize: 9, color: 'var(--ink-mute2)', marginTop: 4, lineHeight: 1.4, paddingLeft: 21 }}>
          {info ? `${info.managerLabel} — ${info.description}` : rule.actionId}
        </div>
      </ClickableDiv>
      <ClickableSpan
        className="notification-center-custom-rule-delete"
        onClick={() => removeNotificationRule(rule.id)}
        title="Delete this notification"
        style={{ fontSize: 10, color: 'var(--ink-faint)', cursor: 'pointer', flexShrink: 0, padding: '0 2px' }}
      >
        ✕
      </ClickableSpan>
    </div>
  );
}

// Inline "create a new notification" form — lets the user pick one of
// MANAGER_ACTIONS (a fixed, developer-defined catalog of real hook points
// across the app's other managers/tools; see that file's own comment) not
// already covered by an existing rule, optionally rename it, and create a
// NotificationRule for it. Local component state only: the in-progress
// selection is throwaway UI state, not something a reload or another
// component needs to see (same reasoning as this file's settingsOpen).
function CreateNotificationForm({ existingActionIds, onDone }: { existingActionIds: Set<string>; onDone: () => void }) {
  const addNotificationRule = useStore((s) => s.addNotificationRule);
  const available = MANAGER_ACTIONS.filter((a) => !existingActionIds.has(a.id));
  const [selectedActionId, setSelectedActionId] = useState<string>(available[0]?.id ?? '');
  const [customLabel, setCustomLabel] = useState('');
  const selected = available.find((a) => a.id === selectedActionId);

  function create() {
    if (!selected) return;
    addNotificationRule(selected.id, customLabel);
    onDone();
  }

  return (
    <div className="notification-center-create-form" style={{ border: '1px solid var(--red-crit)', background: 'rgba(230,80,90,.06)', padding: 9, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {available.length === 0 ? (
        <div className="notification-center-create-form-empty" style={{ fontSize: 9.5, color: 'var(--ink-faint)', lineHeight: 1.5 }}>
          Every available trigger already has a notification. Delete one above to create another.
        </div>
      ) : (
        <>
          <div className="notification-center-create-form-intro" style={{ fontSize: 9, letterSpacing: '.1em', color: 'var(--ink-faint)' }}>
            NOTIFY WHEN ANY USER (INCLUDING YOU) DOES THIS:
          </div>
          <div className="notification-center-create-form-options" style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {available.map((a) => {
              const active = a.id === selectedActionId;
              return (
                <ClickableDiv
                  key={a.id}
                  className="notification-center-create-form-option"
                  onClick={() => setSelectedActionId(a.id)}
                  style={{ border: `1px solid ${active ? 'var(--red-crit)' : 'var(--hairline-mid)'}`, background: active ? 'rgba(230,80,90,.08)' : 'var(--panel-3)', padding: '6px 8px', cursor: 'pointer' }}
                >
                  <div className="notification-center-create-form-option-label" style={{ fontSize: 10.5, fontWeight: 600, color: active ? 'var(--ink-bright)' : 'var(--ink-mute)' }}>
                    {a.managerLabel} — {a.label}
                  </div>
                  <div className="notification-center-create-form-option-description" style={{ fontSize: 8.5, color: 'var(--ink-mute2)', marginTop: 2, lineHeight: 1.35 }}>
                    {a.description}
                  </div>
                </ClickableDiv>
              );
            })}
          </div>
          <input
            className="notification-center-create-form-label-input"
            value={customLabel}
            onChange={(e) => setCustomLabel(e.target.value)}
            placeholder={selected ? selected.label : 'Label'}
            style={{ background: 'var(--panel-3)', border: '1px solid var(--hairline-mid)', color: 'var(--ink)', fontSize: 10, padding: '6px 8px', fontFamily: 'var(--font-mono)' }}
          />
          <div className="notification-center-create-form-actions" style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <ClickableSpan
              className="notification-center-create-form-cancel"
              onClick={onDone}
              style={{ fontFamily: 'var(--font-display)', fontSize: 9.5, fontWeight: 700, letterSpacing: '.05em', color: 'var(--ink-mute)', padding: '5px 10px', cursor: 'pointer' }}
            >
              CANCEL
            </ClickableSpan>
            <ClickableSpan
              className="notification-center-create-form-submit"
              onClick={create}
              style={{ fontFamily: 'var(--font-display)', fontSize: 9.5, fontWeight: 700, letterSpacing: '.05em', color: 'var(--red-crit)', background: 'rgba(230,80,90,.1)', border: '1px solid var(--red-crit)', padding: '5px 10px', cursor: 'pointer' }}
            >
              CREATE
            </ClickableSpan>
          </div>
        </>
      )}
    </div>
  );
}

function NotificationRow({ n }: { n: AppNotification }) {
  const openCard = useStore((s) => s.openCard);
  const targetId = typeof n.payload.targetId === 'string' ? n.payload.targetId : null;
  const color = priorityColor(n.priority);

  return (
    <ClickableDiv
      className="notification-center-row"
      onClick={targetId ? () => openCard(targetId) : undefined}
      tabIndex={targetId ? 0 : undefined}
      role={targetId ? 'button' : undefined}
      style={{ border: '1px solid #1c2a28', borderLeft: `3px solid ${color}`, background: 'var(--panel-3)', padding: '8px 10px', cursor: targetId ? 'pointer' : 'default' }}
    >
      <div className="notification-center-row-header" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="notification-center-row-title" style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 600, color: 'var(--ink-brighter)', flex: 1 }}>
          {n.title}
          {n.count > 1 ? ` ×${n.count}` : ''}
        </span>
        <span className="notification-center-row-time" style={{ fontSize: 8.5, color: 'var(--ink-faint)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
          {fmtRealDTG(new Date(n.createdAt))}
        </span>
      </div>
      {n.body && (
        <div className="notification-center-row-body" style={{ fontSize: 9.5, color: 'var(--ink-mute2)', marginTop: 4, lineHeight: 1.4 }}>
          {n.body}
        </div>
      )}
    </ClickableDiv>
  );
}

// Persistent history of real server-pushed notifications (store.notifications
// — see wsClient.ts's 'notification' handling, server/src/notifications.ts)
// — distinct from Toasts.tsx, which is the ephemeral immediate-visibility
// display for the same events. Opening this panel marks everything read
// (unreadNotificationCount -> 0), same "viewing counts as acknowledging"
// convention the rest of this app doesn't otherwise use elsewhere but fits
// a notification center specifically.
//
// Keyed off activeManager rather than a mount-time effect: App.tsx keeps
// every manager panel permanently mounted and toggles visibility with
// `display: none`/`contents` (so switching tabs preserves each manager's
// own scroll/UI state), which means this component only ever mounts once,
// at app startup — a mount-time effect would fire exactly once and never
// again, leaving the badge stuck at whatever it was when the app first
// loaded. Depending on unreadNotificationCount too means a notification
// that arrives while this panel is already the active one is marked read
// immediately, matching "viewing counts as acknowledging" for that case as
// well, not just the tab-switch case.
export default function NotificationCenterManager() {
  const notifications = useStore((s) => s.notifications);
  const activeManager = useStore((s) => s.activeManager);
  const unreadNotificationCount = useStore((s) => s.unreadNotificationCount);
  const markNotificationsRead = useStore((s) => s.markNotificationsRead);
  const notificationRules = useStore((s) => s.notificationRules);
  // Local, not store state — which of this panel's own two sub-views is
  // showing is pure UI navigation, not something any other component or a
  // reload needs to know about (unlike notificationTypePrefs, which does
  // need to survive both).
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Whether the "create a new notification" form is open — also pure UI
  // navigation, reset to closed every time the form is dismissed or a rule
  // is created (see CreateNotificationForm's onDone).
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (activeManager === 'notifications' && unreadNotificationCount > 0) {
      markNotificationsRead();
    }
  }, [activeManager, unreadNotificationCount, markNotificationsRead]);

  const newestFirst = [...notifications].reverse();

  return (
    <div className="notification-center-manager" style={{ borderRight: '1px solid var(--hairline)', background: 'var(--panel-1)', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
      <ManagerHeader
        className="notification-center-header"
        accentClassName="notification-center-header-accent"
        titleClassName="notification-center-title"
        accentColor="var(--red-crit)"
        title="NOTIFICATIONS"
        titleGrow
      >
        <ClickableDiv
          className="notification-center-settings-toggle"
          onClick={() => setSettingsOpen((v) => !v)}
          title={settingsOpen ? 'Back to notifications' : 'Notification settings'}
          style={{
            width: 22,
            height: 22,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: `1px solid ${settingsOpen ? 'var(--red-crit)' : '#2a3d3a'}`,
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          <GearIcon color={settingsOpen ? 'var(--red-crit)' : 'var(--ink-mute)'} />
        </ClickableDiv>
      </ManagerHeader>

      {settingsOpen ? (
        <div className="notification-center-settings-list" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="notification-center-settings-intro" style={{ fontSize: 9, letterSpacing: '.14em', color: 'var(--ink-faint)', padding: '0 2px', lineHeight: 1.5 }}>
            CHOOSE WHICH EVENTS TRIGGER A NOTIFICATION. DISABLED EVENTS ARE NEITHER TOASTED NOR LOGGED HERE.
          </div>

          <div className="notification-center-custom-group" key="custom">
            <div
              className="notification-center-custom-group-label"
              style={{ fontFamily: 'var(--font-display)', fontSize: 9.5, fontWeight: 700, letterSpacing: '.14em', color: 'var(--red-crit)', padding: '0 2px', marginBottom: 5 }}
            >
              CUSTOM NOTIFICATIONS
            </div>
            <div className="notification-center-custom-group-rows" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {notificationRules.map((rule) => (
                <CustomRuleRow key={rule.id} rule={rule} />
              ))}
              {creating ? (
                <CreateNotificationForm existingActionIds={new Set(notificationRules.map((r) => r.actionId))} onDone={() => setCreating(false)} />
              ) : (
                <ClickableDiv
                  className="notification-center-create-button"
                  onClick={() => setCreating(true)}
                  style={{ border: '1px dashed var(--hairline-mid)', color: 'var(--ink-mute)', fontFamily: 'var(--font-display)', fontSize: 10, fontWeight: 700, letterSpacing: '.05em', padding: '8px 9px', textAlign: 'center', cursor: 'pointer' }}
                >
                  + CREATE NOTIFICATION
                </ClickableDiv>
              )}
            </div>
          </div>

          {NOTIFICATION_CATEGORIES.map((category) => (
            <div className="notification-center-settings-group" key={category}>
              <div
                className="notification-center-settings-group-label"
                style={{ fontFamily: 'var(--font-display)', fontSize: 9.5, fontWeight: 700, letterSpacing: '.14em', color: 'var(--red-crit)', padding: '0 2px', marginBottom: 5 }}
              >
                {category.toUpperCase()}
              </div>
              <div className="notification-center-settings-group-rows" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {NOTIFICATION_TYPES.filter((n) => n.category === category).map(({ type, label, description }) => (
                  <NotificationTypeRow key={type} type={type} label={label} description={description} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="notification-center-list" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {newestFirst.length === 0 && (
            <div className="notification-center-empty" style={{ fontSize: 9.5, letterSpacing: '.08em', color: 'var(--ink-faint)', padding: '0 2px', lineHeight: 1.5 }}>
              NO NOTIFICATIONS YET.
            </div>
          )}
          {newestFirst.map((n) => (
            <NotificationRow key={n.id} n={n} />
          ))}
        </div>
      )}
    </div>
  );
}
