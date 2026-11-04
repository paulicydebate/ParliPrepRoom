import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { endTour, markTourSeen, startTour, tourSeen, useTourOpen } from '../store/tour';
import { IconClose, IconHelp } from './icons';

// A short, skippable tour. Each step points at a part of the screen; steps
// whose part isn't showing right now (not signed in, panel hidden on a small
// screen, ...) are skipped. The same story is on the /guide page.

interface Step {
  /** Selectors to try in order; the first one that is on screen wins. */
  target?: string[];
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    title: 'A one-minute tour',
    body: 'ParliPrepRoom is for prepping a round with your partner: write prep like a doc, see it as a flow, and keep a record that it was typed. Next shows you around. Esc leaves the tour any time.',
  },
  {
    target: ['.sidebar', '[data-tour="menu"]'],
    title: 'Your docs',
    body: 'Prep docs are yours; Reference docs are coach briefs to read from. + makes a new one, the upload icon imports Word, Excel or text files, and you can drag to reorder or open ⋯ to rename or delete.',
  },
  {
    target: ['.space-select'],
    title: 'Teams',
    body: 'Switch between your own docs and your team here. Coaches make a team from the account menu, then send the Students invite link from Team.',
  },
  {
    target: ['.new-round-btn'],
    title: 'Start a round',
    body: 'New round makes a round doc (paste off, typing recorded), opens its flow beside it, and starts the prep timer. Your partner gets an invitation and shares the doc live once they accept.',
  },
  {
    target: ['.timer'],
    title: 'The timer',
    body: 'Prep, speeches and the 1- and 2-minute flex periods. Change times sets your own prep length, and ±1:00 adjusts a running clock. On a round doc your partner sees the same timer.',
  },
  {
    target: ['[data-tour="split"]'],
    title: 'Side by side',
    body: 'Split view puts two or three windows next to each other: the reference doc beside your prep, or your doc beside its flow. Retype what you need; paste is blocked in round docs on purpose.',
  },
  {
    target: ['.pane .view-toggle'],
    title: 'Doc or flow',
    body: 'Every window switches between Doc and Flow. They are the same document, so typing in one changes the other. A claim starts a row; tag a line LOC or MG and it sits in that column.',
  },
  {
    target: ['.pane .pin-btn'],
    title: 'Pin a block',
    body: 'Put the cursor in a section, claim or analytic in your round doc and press Pin. Pin the things you might read in the round.',
  },
  {
    target: ['[data-tour="pins"]'],
    title: 'The pins panel',
    body: 'Pin a block by putting the cursor in a section, claim or analytic in your round doc and pressing Pin in the toolbar. They list here in reading order; pick which flow sheet each one answers and the list follows the sheet you are on. In the flow, the pin button on a column header (like LOC) opens a Pins column beside it.',
  },
  {
    target: ['[data-tour="round-mode"]'],
    title: 'Round Mode',
    body: 'Turn this on when the round starts. Only round docs stay available, the reference docs are hidden, and Ctrl/⌘+K searches what you typed. That is why pins belong in your round doc.',
  },
  {
    target: ['.pane .sync-check'],
    title: 'Saved to the server?',
    body: 'Green means your doc is saved and shared with your partner. Tap the dot to see the round trip time and whether all your edits have arrived.',
  },
  {
    title: 'That is it',
    body: 'The full one-page guide has every step, the style list and the shortcuts. You can retake this tour any time from the ? button in the top bar.',
  },
];

const visible = (el: Element | null): el is HTMLElement => {
  if (!el) return false;
  const r = (el as HTMLElement).getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth;
};

const find = (sels?: string[]): HTMLElement | null => {
  for (const s of sels ?? []) {
    const el = document.querySelector(s);
    if (visible(el)) return el;
  }
  return null;
};

/** Steps that can be shown right now (a step with a target needs it on screen). */
const available = () => STEPS.map((s, i) => ({ s, i })).filter(({ s }) => !s.target || find(s.target));

export function Tour() {
  const open = useTourOpen();
  return open ? <TourRun /> : <TourPrompt />;
}

function TourRun() {
  const [list] = useState(available);
  const [at, setAt] = useState(0);
  const step = list[at]?.s;
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [cardH, setCardH] = useState(180);
  const card = useRef<HTMLDivElement>(null);
  const next = useCallback(() => (at + 1 >= list.length ? endTour() : setAt(at + 1)), [at, list.length]);
  const back = () => setAt((a) => Math.max(0, a - 1));

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === 'Escape') endTour();
      else if (e.key === 'ArrowRight') next(); // Enter presses the focused Next button
      else if (e.key === 'ArrowLeft') back();
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [next]);

  // Follow the target as the page moves or resizes.
  useLayoutEffect(() => {
    const measure = () => {
      const el = find(step?.target);
      setRect(el ? el.getBoundingClientRect() : null);
      if (card.current) setCardH(card.current.offsetHeight);
    };
    measure();
    window.addEventListener('resize', measure);
    const t = setInterval(measure, 400);
    return () => {
      window.removeEventListener('resize', measure);
      clearInterval(t);
    };
  }, [step]);

  if (!step) return null;

  const W = Math.min(340, window.innerWidth - 24);
  const phone = window.innerWidth < 600;
  let style: React.CSSProperties;
  if (!rect) {
    style = { left: (window.innerWidth - W) / 2, top: Math.max(12, (window.innerHeight - cardH) / 2), width: W };
  } else if (phone) {
    style = { left: 12, right: 12, width: 'auto', ...(rect.top > window.innerHeight / 2 ? { top: 12 } : { bottom: 12 }) };
  } else {
    const below = rect.bottom + 14 + cardH < window.innerHeight;
    const top = below ? rect.bottom + 14 : Math.max(12, rect.top - 14 - cardH);
    // Beside the target when there is no room above or below (tall panels).
    const sideways = !below && rect.top - 14 - cardH < 12;
    style = sideways
      ? { top: Math.max(12, Math.min(rect.top, window.innerHeight - cardH - 12)), left: rect.right + 14 + W < window.innerWidth ? rect.right + 14 : Math.max(12, rect.left - 14 - W), width: W }
      : { top, left: Math.max(12, Math.min(rect.left, window.innerWidth - W - 12)), width: W };
  }
  const pad = 6;

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-label="Tour">
      <div className="tour-block" onClick={(e) => e.stopPropagation()} />
      {rect ? (
        <div className="tour-spot" style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} />
      ) : (
        <div className="tour-dim" />
      )}
      <div className="tour-card" ref={card} style={style}>
        <div className="tour-head">
          <span className="tour-count">
            {at + 1} of {list.length}
          </span>
          <button type="button" className="icon-btn small" aria-label="Close the tour" onClick={endTour}>
            <IconClose />
          </button>
        </div>
        <h3>{step.title}</h3>
        <p>{step.body}</p>
        <div className="tour-actions">
          {at + 1 === list.length ? (
            <a className="btn ghost small" href="/guide" target="_blank" rel="noreferrer">
              Open the full guide
            </a>
          ) : (
            <button type="button" className="btn ghost small" onClick={endTour}>
              Skip
            </button>
          )}
          <span className="tb-spacer" />
          {at > 0 && (
            <button type="button" className="btn ghost small" onClick={back}>
              Back
            </button>
          )}
          <button type="button" className="btn primary small" autoFocus onClick={next}>
            {at + 1 === list.length ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** First visit: a small, ignorable offer (never takes over the screen). */
function TourPrompt() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (tourSeen()) return;
    // Wait until the app has settled and no dialog (name, sign-in...) is open.
    const t = setTimeout(() => {
      if (!document.querySelector('dialog[open]')) setShow(true);
    }, 2500);
    return () => clearTimeout(t);
  }, []);
  if (!show) return null;
  const dismiss = () => {
    markTourSeen();
    setShow(false);
  };
  return (
    <div className="tour-offer" role="region" aria-label="Tour">
      <strong>New here?</strong>
      <span className="muted small">A one-minute tour shows where everything is.</span>
      <div className="tour-actions">
        <button type="button" className="btn ghost small" onClick={dismiss}>
          Not now
        </button>
        <button
          type="button"
          className="btn primary small"
          onClick={() => {
            setShow(false);
            startTour();
          }}
        >
          Take the tour
        </button>
      </div>
    </div>
  );
}

/** The ? button in the top bar: retake the tour or open the guide. */
export function HelpMenu() {
  const ref = useRef<HTMLDetailsElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  useEffect(() => {
    const away = (e: PointerEvent) => {
      if (ref.current?.open && !ref.current.contains(e.target as Node)) ref.current.open = false;
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, []);
  const close = () => {
    if (ref.current) ref.current.open = false;
  };
  return (
    <details
      ref={ref}
      className="help-menu"
      onToggle={(e) => {
        const d = e.currentTarget as HTMLDetailsElement;
        if (d.open) {
          const r = d.getBoundingClientRect();
          setPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
        }
      }}
    >
      <summary className="icon-btn" aria-label="Help" title="Help: take the tour, read the guide">
        <IconHelp />
      </summary>
      <div className="menu help-pop" style={pos ? { position: 'fixed', top: pos.top, right: pos.right, left: 'auto' } : undefined}>
        <button
          type="button"
          onClick={() => {
            close();
            startTour();
          }}
        >
          Take the 1-minute tour
        </button>
        <a href="/guide" target="_blank" rel="noreferrer" onClick={close}>
          Open the guide (new tab)
        </a>
        <a href="/privacy" target="_blank" rel="noreferrer" onClick={close}>
          Privacy
        </a>
      </div>
    </details>
  );
}
