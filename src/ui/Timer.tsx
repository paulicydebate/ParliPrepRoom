import { useEffect, useRef, useState } from 'react';
import type * as Y from 'yjs';
import { toast } from '../editor/roundGuard';
import { serverNow } from '../store/account';
import { PRESETS, choose, format, pause, reset, start, timeLeft, useTimer } from '../store/timer';

/**
 * Top-bar timer: prep, speeches and flex periods. On a round doc it's shared
 * with the partner (both see the same countdown).
 */
export function Timer({ doc }: { doc: Y.Doc | null }) {
  const { state, shared, set } = useTimer(doc);
  const [now, setNow] = useState(serverNow());
  const [custom, setCustom] = useState('');
  const menu = useRef<HTMLDetailsElement>(null);
  const running = state.endsAt !== null;
  const left = timeLeft(state, now);
  const done = running && left <= 0;

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(serverNow()), 250);
    return () => clearInterval(t);
  }, [running]);

  // Say so once when time runs out.
  const announced = useRef<number | null>(null);
  useEffect(() => {
    if (done && announced.current !== state.endsAt) {
      announced.current = state.endsAt;
      toast(`Time: ${state.label} is over.`);
    }
  }, [done, state.endsAt, state.label]);

  const pick = (label: string, minutes: number) => {
    set(choose(label, minutes, true));
    if (menu.current) menu.current.open = false;
  };

  const warn = running && left <= 60_000 && !done;

  return (
    <div className={'timer' + (running ? ' is-running' : '') + (warn ? ' is-warn' : '') + (done ? ' is-done' : '')}>
      <details className="timer-menu" ref={menu}>
        <summary title={shared ? 'Timer shared with everyone on this round doc' : 'Timer (on this device)'}>
          <span className="timer-label">{state.label}</span>
          <span className="timer-time">{format(left)}</span>
          {shared && <span className="timer-shared" aria-label="Shared" />}
        </summary>
        <div className="menu timer-pop">
          <div className="timer-presets">
            {PRESETS.map((p) => (
              <button key={`${p.label}-${p.minutes}`} type="button" onClick={() => pick(p.label, p.minutes)}>
                <strong>{p.label}</strong> {p.minutes}:00
              </button>
            ))}
          </div>
          <form
            className="timer-custom"
            onSubmit={(e) => {
              e.preventDefault();
              const m = Number(custom);
              if (m > 0 && m <= 180) pick('Timer', m);
            }}
          >
            <input value={custom} onChange={(e) => setCustom(e.target.value)} inputMode="decimal" placeholder="Minutes" aria-label="Custom minutes" />
            <button type="submit" className="btn small">
              Start
            </button>
          </form>
          <p className="muted small">{shared ? 'Shared: your partner sees and controls the same timer.' : 'Open a round doc to share the timer with your partner.'}</p>
        </div>
      </details>
      <button
        type="button"
        className="timer-btn"
        aria-label={running ? 'Pause timer' : 'Start timer'}
        title={running ? 'Pause' : 'Start'}
        onClick={() => set(running ? pause(state) : start(left <= 0 ? reset(state) : state))}
      >
        {running ? '❚❚' : '▶'}
      </button>
      <button type="button" className="timer-btn" aria-label="Reset timer" title="Reset" onClick={() => set(reset(state))}>
        ↺
      </button>
    </div>
  );
}
