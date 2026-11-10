import type { JSONContent } from '@tiptap/core';
import type { Editor } from '@tiptap/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from '../editor/roundGuard';
import { diffBlocks, flattenDoc, summarize } from '../history/diff';
import { diffFlows, flattenFlow, summarizeFlow } from '../history/flowDiff';
import { restoreFlow } from '../flow2/restore';
import type * as Y from 'yjs';
import { FlowDiffLines, FlowSnapshotView } from './FlowHistory';
import { DocReplayer, decodeLog, sessionsOf, type DecodedUpdate, type EditSession } from '../history/timeline';
import { docLog } from '../store/account';
import { colorFor } from '../store/sync';
import { logEvent } from '../store/typingLog';
import { DiffLines, Line } from './HistoryView';

const time = (t: number) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const timeS = (t: number) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
const day = (t: number) => {
  const d = new Date(t);
  const today = new Date();
  const y = new Date();
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
};

/** Load and decode the server's record for a doc. */
function useRecord(docId: string) {
  const [updates, setUpdates] = useState<DecodedUpdate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => {
    setError(null);
    docLog(docId).then(
      (log) => setUpdates(decodeLog(log)),
      (e: Error) => setError(e.message),
    );
  };
  useEffect(load, [docId]);
  const replayer = useMemo(() => (updates ? new DocReplayer(updates) : null), [updates]);
  return { updates, replayer, error, reload: load };
}

/**
 * History (edit sessions by person, from the server) or Replay (scrub
 * through every edit). Both show everyone's edits, not just this device's.
 */
export function ServerHistory({
  mode,
  docId,
  ydoc,
  format,
  editor,
  round,
  tabs,
  onClose,
}: {
  mode: 'history' | 'replay';
  docId: string;
  ydoc: Y.Doc;
  format: 'doc' | 'flow';
  editor: Editor | null;
  round: boolean;
  tabs: React.ReactNode;
  onClose: () => void;
}) {
  const { updates, replayer, error, reload } = useRecord(docId);
  return (
    <div className="history">
      <div className="history-main">
        <div className="history-bar">
          {tabs}
          <span className="tb-spacer" />
          <button type="button" className="btn ghost small" onClick={reload} title="Load the latest edits">
            Refresh
          </button>
          {mode === 'replay' && (
            <button type="button" className="btn ghost" onClick={onClose}>
              Done
            </button>
          )}
        </div>
        {error && <p className="muted history-pad">{error}</p>}
        {!error && !updates && <p className="muted history-pad">Loading the record…</p>}
        {updates && replayer && mode === 'history' && <Sessions updates={updates} replayer={replayer} editor={editor} ydoc={ydoc} format={format} round={round} docId={docId} onClose={onClose} />}
        {updates && replayer && mode === 'replay' && <Replay updates={updates} replayer={replayer} format={format} />}
      </div>
    </div>
  );
}

function Sessions({
  updates,
  replayer,
  editor,
  ydoc,
  format,
  round,
  docId,
  onClose,
}: {
  updates: DecodedUpdate[];
  replayer: DocReplayer;
  editor: Editor | null;
  ydoc: Y.Doc;
  format: 'doc' | 'flow';
  round: boolean;
  docId: string;
  onClose: () => void;
}) {
  const sessions = useMemo(() => sessionsOf(updates).reverse(), [updates]);
  const [sel, setSel] = useState<EditSession | null>(sessions[0] ?? null);
  const [view, setView] = useState<'changes' | 'doc' | 'since'>('changes');
  const [confirm, setConfirm] = useState(false);
  useEffect(() => setConfirm(false), [sel]);

  const flow = format === 'flow';
  const before = useMemo(() => (sel && !flow ? replayer.jsonAt(sel.from - 1) : null), [sel, replayer, flow]);
  const after = useMemo(() => (sel && !flow ? replayer.jsonAt(sel.to) : null), [sel, replayer, flow]);
  const now = useMemo(() => (flow ? null : replayer.jsonAt(updates.length - 1)), [replayer, updates.length, flow]);
  const rows = useMemo(() => {
    if (!before || !after || !now) return [];
    return view === 'since' ? diffBlocks(flattenDoc(after), flattenDoc(now)) : diffBlocks(flattenDoc(before), flattenDoc(after));
  }, [before, after, now, view]);
  const flowBefore = useMemo(() => (sel && flow ? replayer.flowAt(sel.from - 1) : null), [sel, replayer, flow]);
  const flowAfter = useMemo(() => (sel && flow ? replayer.flowAt(sel.to) : null), [sel, replayer, flow]);
  const flowNow = useMemo(() => (flow ? replayer.flowAt(updates.length - 1) : null), [replayer, updates.length, flow]);
  const flowRows = useMemo(() => {
    if (!flowBefore || !flowAfter || !flowNow) return [];
    return view === 'since' ? diffFlows(flattenFlow(flowAfter), flattenFlow(flowNow)) : diffFlows(flattenFlow(flowBefore), flattenFlow(flowAfter));
  }, [flowBefore, flowAfter, flowNow, view]);
  const stats = flow ? summarizeFlow(flowRows) : summarize(rows);

  const restore = () => {
    if (flow && sel) {
      if (round) logEvent(docId, { k: 'restore', s: `${day(sel.end)} ${time(sel.end)} (after ${sel.name}'s edits)` });
      const point = replayer.docAt(sel.to);
      restoreFlow(ydoc, point);
      point.destroy();
      toast('Restored. Ctrl/⌘+Z in the flow undoes it.');
      onClose();
      return;
    }
    if (!editor || !after || !sel) return;
    if (round) logEvent(docId, { k: 'restore', s: `${day(sel.end)} ${time(sel.end)} (after ${sel.name}'s edits)` });
    editor.commands.setContent(after as JSONContent);
    toast('Restored. The restore itself is in the history too, so it can be undone the same way.');
    onClose();
  };

  if (!sessions.length) return <p className="muted history-pad">No edits on the server yet.</p>;
  let lastDay = '';

  return (
    <div className="history server-history">
      <div className="history-main">
        {sel && (
          <>
            <div className="history-bar sub">
              <span className="who-dot" style={{ background: colorFor(sel.userId) }} />
              <strong>{sel.name}</strong>
              <span className="muted small">
                {day(sel.start)} {time(sel.start)}
                {sel.end - sel.start > 60_000 ? `–${time(sel.end)}` : ''} · +{sel.inserted.toLocaleString()} / −{sel.deleted.toLocaleString()} characters
                {sel.catchup ? ' · synced after being offline' : ''}
              </span>
              <span className="tb-spacer" />
              <div className="seg" role="group" aria-label="Show">
                <button type="button" className={view === 'changes' ? 'is-on' : ''} onClick={() => setView('changes')}>
                  What changed
                </button>
                <button type="button" className={view === 'doc' ? 'is-on' : ''} onClick={() => setView('doc')}>
                  Doc then
                </button>
                <button type="button" className={view === 'since' ? 'is-on' : ''} onClick={() => setView('since')}>
                  Since then
                </button>
              </div>
              {confirm ? (
                <span className="confirm">
                  <button type="button" className="btn ghost small" onClick={() => setConfirm(false)}>
                    Cancel
                  </button>
                  <button type="button" className="btn primary small" onClick={restore}>
                    Restore
                  </button>
                </span>
              ) : (
                <button type="button" className="btn small" disabled={!editor && !flow} onClick={() => setConfirm(true)} title="Put the doc back the way it was right after these edits">
                  Restore to this point
                </button>
              )}
            </div>
            {view !== 'doc' && (
              <p className="history-summary">
                {stats.added + stats.changed + stats.removed === 0
                  ? view === 'since'
                    ? 'No changes since this point.'
                    : 'No visible text changes (formatting or styles only).'
                  : `${stats.added} added, ${stats.changed} edited, ${stats.removed} removed${view === 'since' ? ' since then' : ` by ${sel.name}`}.`}
              </p>
            )}
            <div className="pp-doc history-doc who-diff" style={{ ['--who' as string]: colorFor(sel.userId) }}>
              {!flow && view === 'doc' && after && flattenDoc(after).map((b, i) => <Line key={i} block={b} />)}
              {!flow && view !== 'doc' && <DiffLines rows={rows} changesOnly={view === 'changes'} />}
              {flow && view === 'doc' && flowAfter && <FlowSnapshotView sheets={flowAfter} />}
              {flow && view !== 'doc' && <FlowDiffLines rows={flowRows} changesOnly={view === 'changes'} />}
            </div>
          </>
        )}
      </div>
      <aside className="history-list" aria-label="Edit sessions">
        <div className="history-list-head">
          <strong>Who changed what</strong>
          <button type="button" className="btn ghost" onClick={onClose}>
            Done
          </button>
        </div>
        <p className="muted small">From the server: every edit by everyone, grouped into sessions with no pause over 2 minutes.</p>
        <ul>
          {sessions.map((s) => {
            const d = day(s.start);
            const header = d !== lastDay ? (
              <li className="day" key={`d-${s.index}`}>
                {d}
              </li>
            ) : null;
            lastDay = d;
            return [
              header,
              <li key={s.index}>
                <button type="button" className={'version session' + (sel?.index === s.index ? ' is-on' : '')} onClick={() => setSel(s)}>
                  <span className="who-dot" style={{ background: colorFor(s.userId) }} />
                  <span className="v-name">
                    {s.name}
                    <span className="muted small">
                      {' '}
                      +{s.inserted} / −{s.deleted}
                      {s.catchup ? ' · offline' : ''}
                    </span>
                  </span>
                  <span className="v-time">{time(s.start)}</span>
                </button>
              </li>,
            ];
          })}
        </ul>
      </aside>
    </div>
  );
}

/** Scrub or play through every edit. */
function Replay({ updates, replayer, format }: { updates: DecodedUpdate[]; replayer: DocReplayer; format: 'doc' | 'flow' }) {
  const [i, setI] = useState(updates.length - 1);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(8);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!playing) return;
    timer.current = setInterval(() => {
      setI((x) => {
        if (x >= updates.length - 1) {
          setPlaying(false);
          return x;
        }
        return x + 1;
      });
    }, 1000 / speed);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [playing, speed, updates.length]);

  const flow = format === 'flow';
  const json = useMemo(() => (flow ? null : replayer.jsonAt(i)), [replayer, i, flow]);
  const sheets = useMemo(() => (flow ? replayer.flowAt(i) : null), [replayer, i, flow]);
  const u = updates[i];
  const people = useMemo(() => [...new Map(updates.map((x) => [x.userId, x.name])).entries()], [updates]);

  return (
    <div className="replay">
      <div className="replay-controls">
        <button
          type="button"
          className="btn primary small"
          onClick={() => {
            if (!playing && i >= updates.length - 1) setI(-1);
            setPlaying((p) => !p);
          }}
        >
          {playing ? 'Pause' : i >= updates.length - 1 ? 'Play from start' : 'Play'}
        </button>
        <input
          type="range"
          min={-1}
          max={updates.length - 1}
          value={i}
          onChange={(e) => {
            setPlaying(false);
            setI(Number(e.target.value));
          }}
          aria-label="Position in the record"
        />
        <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="Speed">
          <option value={2}>Slow</option>
          <option value={8}>Normal</option>
          <option value={30}>Fast</option>
          <option value={120}>Very fast</option>
        </select>
      </div>
      <div className="replay-now">
        {u ? (
          <>
            <span className="who-dot" style={{ background: colorFor(u.userId) }} />
            <strong>{u.name}</strong>
            <span className="muted small">
              {day(u.at)} {timeS(u.at)} · edit {i + 1} of {updates.length}
              {u.via !== 'live' ? ' · synced after being offline' : ''}
            </span>
            <span className="replay-edit">
              {u.deletedText && <del>{u.deletedText.slice(0, 80)}</del>}
              {u.text && <ins style={{ background: `color-mix(in srgb, ${colorFor(u.userId)} 25%, transparent)` }}>{u.text.slice(0, 80)}</ins>}
            </span>
          </>
        ) : (
          <span className="muted small">Start: empty doc</span>
        )}
      </div>
      <div className="replay-people">
        {people.map(([id, name]) => (
          <span key={id} className="replay-person">
            <span className="who-dot" style={{ background: colorFor(id) }} /> {name}
          </span>
        ))}
      </div>
      {flow ? <div className="history-doc">{sheets && <FlowSnapshotView sheets={sheets} />}</div> : <div className="pp-doc history-doc">{flattenDoc(json).map((b, k) => <Line key={k} block={b} />)}</div>}
    </div>
  );
}
