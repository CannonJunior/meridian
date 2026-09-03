import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { ORGANIZATIONS } from '../assets/staff';
import { fmtLogTime } from '../selectors';
import ManagerHeader from './ManagerHeader';
import { ClickableSpan } from './Clickable';

export default function ChatManager() {
  const activeChatOrgId = useStore((s) => s.activeChatOrgId);
  const activeChatTargetId = useStore((s) => s.activeChatTargetId);
  const chatMessages = useStore((s) => s.chatMessages);
  const targets = useStore((s) => s.targets);
  const pendingActions = useStore((s) => s.pendingActions);
  const openChat = useStore((s) => s.openChat);
  const setChatTargetScope = useStore((s) => s.setChatTargetScope);
  const sendChatMessage = useStore((s) => s.sendChatMessage);
  const reportManagerAction = useStore((s) => s.reportManagerAction);
  const [draft, setDraft] = useState('');

  const org = ORGANIZATIONS.find((o) => o.id === activeChatOrgId) ?? ORGANIZATIONS[0];
  // This panel stays mounted (just hidden) while any other manager is
  // active, and `targets`/`pendingActions` both get a new array reference
  // roughly once/second (the sim mutates target decay every tick) — without
  // memoizing, that redid this thread filter and every org's pending count
  // below once/second for the life of the tab, even while BOARD COMMS was
  // never opened.
  const thread = useMemo(() => chatMessages.filter((m) => m.orgId === org.id), [chatMessages, org.id]);
  const scopedTarget = activeChatTargetId ? targets.find((x) => x.id === activeChatTargetId) : undefined;
  // One pass over pendingActions instead of one .filter() per org (there
  // are 5+ orgs, each previously re-scanning the whole array in the tabs
  // loop below).
  const pendingCountByOrg = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of pendingActions) {
      if (a.status !== 'pending') continue;
      counts.set(a.orgId, (counts.get(a.orgId) ?? 0) + 1);
    }
    return counts;
  }, [pendingActions]);
  const pendingHere = pendingCountByOrg.get(org.id) ?? 0;

  function submit() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    sendChatMessage(draft);
    reportManagerAction('chat.message-sent', `${org.acronym}: ${trimmed}`, activeChatTargetId ?? undefined);
    setDraft('');
  }

  return (
    <div className="chat-manager" style={{ borderRight: '1px solid var(--hairline)', background: 'var(--panel-1)', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
      <ManagerHeader
        className="chat-manager-header"
        accentClassName="chat-manager-header-accent"
        titleClassName="chat-manager-title"
        accentColor="var(--red)"
        title="BOARD · COMMS"
      />

      <div className="chat-manager-org-tabs" style={{ display: 'flex', flexWrap: 'wrap', gap: 5, padding: '8px 10px', borderBottom: '1px solid var(--hairline)' }}>
        {ORGANIZATIONS.map((o) => {
          const active = o.id === org.id;
          const count = pendingCountByOrg.get(o.id) ?? 0;
          return (
            <ClickableSpan
              key={o.id}
              className="chat-manager-org-tab"
              onClick={() => openChat(o.id, activeChatOrgId === o.id ? activeChatTargetId ?? undefined : undefined)}
              title={o.name}
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 9.5,
                fontWeight: 700,
                letterSpacing: '.05em',
                padding: '4px 7px',
                border: `1px solid ${active ? 'var(--red)' : 'var(--hairline-mid)'}`,
                color: active ? 'var(--red)' : 'var(--ink-mute)',
                background: active ? 'rgba(255,90,71,.08)' : 'var(--panel-3)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              {o.acronym}
              {count > 0 && (
                <span className="chat-manager-org-tab-badge" style={{ fontSize: 8, color: active ? 'var(--red)' : 'var(--amber)', fontWeight: 700 }}>
                  {count}
                </span>
              )}
            </ClickableSpan>
          );
        })}
      </div>

      <div className="chat-manager-org-desc" style={{ fontSize: 9, color: 'var(--ink-faint)', lineHeight: 1.5, padding: '8px 10px', borderBottom: '1px solid var(--hairline)' }}>
        {org.name} — {org.description}
        {pendingHere > 0 && (
          <span className="chat-manager-org-desc-pending" style={{ display: 'block', marginTop: 4, color: 'var(--amber)' }}>
            {pendingHere} request{pendingHere === 1 ? '' : 's'} currently pending here.
          </span>
        )}
      </div>

      <div className="chat-manager-thread" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {thread.length === 0 && (
          <div className="chat-manager-empty-note" style={{ fontSize: 9.5, color: 'var(--ink-faint)', lineHeight: 1.5 }}>
            No messages with {org.acronym} yet. Click a pending or resolved approval on a target card to ask about it directly, or just say something below.
          </div>
        )}
        {thread.map((m) => {
          const mine = m.from === 'user';
          const targetTag = m.targetId ? targets.find((x) => x.id === m.targetId) : undefined;
          return (
            <div key={m.id} className="chat-manager-message" style={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start' }}>
              <div className="chat-manager-message-meta" style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 2 }}>
                <span className="chat-manager-message-author" style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '.04em', color: mine ? 'var(--cyan)' : 'var(--ink-bright)' }}>
                  {m.authorName}
                </span>
                <span className="chat-manager-message-role" style={{ fontSize: 7.5, color: 'var(--ink-faint)' }}>
                  {m.authorRoleLabel}
                </span>
                <span className="chat-manager-message-time" style={{ fontSize: 7.5, color: 'var(--ink-dim2)' }}>
                  {fmtLogTime(m.t)}
                </span>
              </div>
              <div
                className="chat-manager-message-bubble"
                style={{
                  maxWidth: '92%',
                  fontSize: 10,
                  lineHeight: 1.45,
                  color: 'var(--ink)',
                  border: `1px solid ${mine ? 'var(--hairline-mid)' : '#2a3d3a'}`,
                  background: mine ? 'var(--panel-3)' : 'rgba(63,210,230,.05)',
                  padding: '6px 8px',
                }}
              >
                {targetTag && (
                  <span className="chat-manager-message-target-tag" style={{ display: 'inline-block', fontSize: 7.5, letterSpacing: '.05em', color: 'var(--amber)', border: '1px solid #5a4420', padding: '1px 4px', marginBottom: 4 }}>
                    {targetTag.id.slice(1)} {targetTag.name}
                  </span>
                )}
                <div className="chat-manager-message-text">{m.text}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="chat-manager-scope-row" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderTop: '1px solid var(--hairline)' }}>
        <span className="chat-manager-scope-label" style={{ fontSize: 8, letterSpacing: '.08em', color: 'var(--ink-faint)' }}>
          RE:
        </span>
        {scopedTarget ? (
          <span className="chat-manager-scope-value" style={{ fontSize: 9, color: 'var(--amber)', flex: 1 }}>
            {scopedTarget.id.slice(1)} {scopedTarget.name}
          </span>
        ) : (
          <span className="chat-manager-scope-value-general" style={{ fontSize: 9, color: 'var(--ink-mute)', flex: 1 }}>
            general
          </span>
        )}
        {scopedTarget && (
          <ClickableSpan className="chat-manager-scope-clear-button" onClick={() => setChatTargetScope(null)} style={{ fontSize: 8.5, color: 'var(--ink-faint)', cursor: 'pointer' }}>
            clear ✕
          </ClickableSpan>
        )}
      </div>

      <div className="chat-manager-input-row" style={{ display: 'flex', gap: 6, padding: '8px 10px', borderTop: '1px solid var(--hairline)' }}>
        <input
          className="chat-manager-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          placeholder={`Message ${org.acronym}...`}
          style={{ flex: 1, minWidth: 0, background: 'var(--panel-3)', border: '1px solid var(--hairline-mid)', color: 'var(--ink)', fontSize: 10, padding: '6px 8px', fontFamily: 'var(--font-mono)' }}
        />
        <button
          className="chat-manager-send-button"
          onClick={submit}
          style={{ fontFamily: 'var(--font-display)', fontSize: 9.5, fontWeight: 700, letterSpacing: '.05em', color: 'var(--red)', background: 'rgba(255,90,71,.08)', border: '1px solid var(--red)', padding: '0 12px', cursor: 'pointer' }}
        >
          SEND
        </button>
      </div>
    </div>
  );
}
