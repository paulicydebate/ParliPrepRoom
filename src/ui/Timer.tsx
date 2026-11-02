import { useEffect, useRef, useState } from 'react';
import type * as Y from 'yjs';
import { toast } from '../editor/roundGuard';
import { serverNow } from '../store/account';
import {
  DEFAULT_PRESETS,
  adjust,
  choose,
  format,
  formatMinutes,
  parseMinutes,
  pause,
  reset,
  savePresets,
  start,
  timeLeft,
  usePresets,
  useTimer,
  type Preset,
} from '../store/timer';

/**
 * Top-bar timer: prep, speeches and flex periods. On a round doc it's shared
 * with the partner (both see the same countdown).
 */
export function Timer({ doc }: { doc: Y.Doc | null }) {
  const { state, shared, set } = useTimer(doc);
  const [now, setNow] = useState(serverNow());
  const [custom, setCustom] = useState('');
  const [customLabel, setCustomLabel] = useState('');
  const [editing, setEditing] = useState(false);
  const presets = usePresets();
  const menu = useRef<HTMLDetailsElement>(null);
  const running = state.endsAt !== null;
  const left = timeLeft(state, now);
  const done = running && left <= 0;

  useEffect(() => {
    setNow(serverNow());
    if (!running) return;
    const t = setInterval(() => setNow(serverNow()), 250);
    return () => clearInterval(t);
  }, [running, state.endsAt, state.remainingMs]);

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
          {editing ? (
            <PresetEditor presets={presets} onDone={() => setEditing(false)} />
          ) : (
            <>
              <div className="timer-presets">
                {presets.map((p, i) => (
                  <button key={i} type="button" onClick={() => pick(p.label, p.minutes)}>
                    <strong>{p.label}</strong> {format(p.minutes * 60_000)}
                  </button>
                ))}
              </div>
              <form
                className="timer-custom"
                onSubmit={(e) => {
                  e.preventDefault();
                  const m = parseMinutes(custom);
                  if (m === null) {
                    toast('Type a length like 25, 2.5 or 2:30.');
                    return;
                  }
                  pick(customLabel.trim() || 'Timer', m);
                  setCustom('');
                  setCustomLabel('');
                }}
              >
                <input className="timer-name" value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} placeholder="Name" aria-label="Timer name" maxLength={12} />
                <input value={custom} onChange={(e) => setCustom(e.target.value)} inputMode="decimal" placeholder="Min, e.g. 25 or 2:30" aria-label="Length in minutes" />
                <button type="submit" className="btn small">
                  Start
                </button>
              </form>
              <div className="timer-adjust">
                <span className="muted small">Adjust</span>
                <button type="button" className="btn small ghost" onClick={() => set(adjust(state, -60_000))}>
                  −1:00
                </button>
                <button type="button" className="btn small ghost" onClick={() => set(adjust(state, 60_000))}>
                  +1:00
                </button>
                <span className="tb-spacer" />
                <button type="button" className="btn small ghost" onClick={() => setEditing(true)}>
                  Change times
                </button>
              </div>
            </>
          )}
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

/** Change the preset buttons' names and lengths (saved on this device). */
function PresetEditor({ presets, onDone }: { presets: Preset[]; onDone: () => void }) {
  const [rows, setRows] = useState(() => presets.map((p) => ({ label: p.label, time: formatMinutes(p.minutes) })));
  const bad = rows.map((r) => !r.label.trim() || parseMinutes(r.time) === null);
  const save = () => {
    if (bad.some(Boolean)) {
      toast('Each timer needs a name and a length like 25, 2.5 or 2:30.');
      return;
    }
    savePresets(rows.map((r) => ({ label: r.label.trim(), minutes: parseMinutes(r.time)! })));
    onDone();
  };
  const edit = (i: number, patch: Partial<(typeof rows)[number]>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="timer-edit">
      <p className="muted small">Times are saved on this device. Lengths in minutes: 25, 2.5 or 2:30.</p>
      <ul>
        {rows.map((r, i) => (
          <li key={i} className={bad[i] ? 'is-bad' : ''}>
            <input value={r.label} onChange={(e) => edit(i, { label: e.target.value })} aria-label="Name" maxLength={12} />
            <input value={r.time} onChange={(e) => edit(i, { time: e.target.value })} inputMode="decimal" aria-label={`${r.label} length`} />
            <button type="button" className="icon-btn" aria-label={`Remove ${r.label}`} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>
              ×
            </button>
          </li>
        ))}
      </ul>
      <div className="timer-adjust">
        <button type="button" className="btn small ghost" onClick={() => setRows((rs) => [...rs, { label: 'Timer', time: '5' }])}>
          + Add
        </button>
        <button
          type="button"
          className="btn small ghost"
          onClick={() => setRows(DEFAULT_PRESETS.map((p) => ({ label: p.label, time: formatMinutes(p.minutes) })))}
        >
          Defaults
        </button>
        <span className="tb-spacer" />
        <button type="button" className="btn small ghost" onClick={onDone}>
          Cancel
        </button>
        <button type="button" className="btn small primary" onClick={save} disabled={!rows.length}>
          Save
        </button>
      </div>
    </div>
  );
}
