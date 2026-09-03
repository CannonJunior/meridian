import { useStore } from '../store';
import { TUTORIALS } from '../assets/tutorials';
import ManagerHeader from './ManagerHeader';
import { ClickableDiv } from './Clickable';
import { TYPE_SCALE } from '../layout';

// The guided-tour panel for whichever tutorial is running (assets/
// tutorials.ts). Each step's own `run()` already performed the real system
// effect it narrates by the time it's shown here — this panel is just the
// narration/caveat/controls around that, not a separate simulation.
export default function TutorialOverlay() {
  const activeTutorialId = useStore((s) => s.activeTutorialId);
  const tutorialStepIndex = useStore((s) => s.tutorialStepIndex);
  const advanceTutorial = useStore((s) => s.advanceTutorial);
  const fastForwardTutorial = useStore((s) => s.fastForwardTutorial);
  const exitTutorial = useStore((s) => s.exitTutorial);

  if (!activeTutorialId) return null;
  const tutorial = TUTORIALS.find((t) => t.id === activeTutorialId);
  if (!tutorial) return null;
  const step = tutorial.steps[tutorialStepIndex];
  if (!step) return null;
  const isLast = tutorialStepIndex === tutorial.steps.length - 1;

  return (
    <div
      className="tutorial-overlay"
      style={{
        position: 'fixed',
        left: 14,
        bottom: 14,
        width: 400,
        maxHeight: '62vh',
        zIndex: 300,
        background: 'var(--panel-2)',
        border: '1px solid var(--amber)',
        boxShadow: '0 24px 70px rgba(0,0,0,.6)',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'var(--font-mono)',
      }}
    >
      <ManagerHeader
        className="tutorial-overlay-header"
        accentClassName="tutorial-overlay-header-accent"
        titleClassName="tutorial-overlay-title"
        accentColor="var(--amber)"
        title={tutorial.name.toUpperCase()}
        titleFontSize={TYPE_SCALE.basePlus}
        titleLetterSpacing=".16em"
        titleGrow
      >
        <span className="tutorial-overlay-step-count" style={{ fontSize: 9, color: 'var(--ink-faint)' }}>
          {tutorialStepIndex + 1} / {tutorial.steps.length}
        </span>
        <ClickableDiv className="tutorial-overlay-exit-button" onClick={exitTutorial} title="Exit tutorial" style={{ width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #2a3d3a', cursor: 'pointer', fontSize: 11, color: 'var(--ink-mute)', flexShrink: 0 }}>
          ✕
        </ClickableDiv>
      </ManagerHeader>

      <div className="tutorial-overlay-body" style={{ padding: '13px 14px', overflowY: 'auto', overflowX: 'hidden', flex: 1 }}>
        <div className="tutorial-overlay-step-title" style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: 'var(--ink-bright)', marginBottom: 8 }}>
          {step.title}
        </div>
        <div className="tutorial-overlay-narration" style={{ fontSize: 10.5, color: 'var(--ink-mute)', lineHeight: 1.55, whiteSpace: 'pre-line' }}>
          {step.narration}
        </div>
        {step.caveat && (
          <div className="tutorial-overlay-caveat" style={{ marginTop: 10, padding: '8px 10px', border: '1px solid #5a4420', background: 'rgba(255,171,56,.06)' }}>
            <span className="tutorial-overlay-caveat-label" style={{ display: 'block', fontFamily: 'var(--font-display)', fontSize: 8, letterSpacing: '.14em', color: 'var(--amber)', marginBottom: 4 }}>
              NOT YET IN MERIDIAN
            </span>
            <span className="tutorial-overlay-caveat-text" style={{ fontSize: 9.5, color: 'var(--amber)', lineHeight: 1.5 }}>
              {step.caveat}
            </span>
          </div>
        )}
      </div>

      <div className="tutorial-overlay-footer" style={{ display: 'flex', gap: 8, padding: '10px 14px', borderTop: '1px solid var(--hairline)' }}>
        {step.fastForward && (
          <ClickableDiv
            className="tutorial-overlay-fast-forward-button"
            onClick={fastForwardTutorial}
            style={{ flex: 1, textAlign: 'center', padding: 8, border: '1px solid var(--cyan)', color: 'var(--cyan)', fontFamily: 'var(--font-display)', fontSize: 9.5, letterSpacing: '.06em', cursor: 'pointer', fontWeight: 600 }}
          >
            ⏩ {step.fastForwardLabel ?? 'FAST-FORWARD'}
          </ClickableDiv>
        )}
        <ClickableDiv
          className="tutorial-overlay-next-button"
          onClick={advanceTutorial}
          style={{ flex: 1, textAlign: 'center', padding: 8, border: '1px solid var(--amber)', background: 'rgba(255,171,56,.1)', color: 'var(--amber)', fontFamily: 'var(--font-display)', fontSize: 9.5, letterSpacing: '.06em', cursor: 'pointer', fontWeight: 700 }}
        >
          {isLast ? 'FINISH' : 'NEXT ▸'}
        </ClickableDiv>
      </div>
    </div>
  );
}
