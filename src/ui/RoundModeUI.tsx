import type { Editor } from '@tiptap/react';
import { useEditorState } from '@tiptap/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { KIND_INFO, asKind, isHeading } from '../model/blocks';
import { blockWithChildren, searchEntries, type OutlineEntry } from '../model/outline';
import type { DocMeta } from '../store/docs';
import { useRoundMode } from '../store/roundMode';
import { clearPins, followSheet, isPinned, movePin, selectGroup, setFollowFlow, setPinGroup, togglePin, useBoard, usePins, visiblePins } from '../store/pins';
import { searchFlow, type FlowEntry } from '../model/flowSearch';
import { useOpenFlows } from '../store/flowPins';
import { IconClose, IconPin } from './icons';

export type JumpTo = (docId: string, blockId: string) => void;

/** A search result: a block in a doc, or a cell on a flow. */
type Result = { entry: OutlineEntry | null; target: OutlineEntry | null; score: number; doc: DocMeta; flow: FlowEntry | null };

/** Ctrl/Cmd+K: search the prep and jump to (or pin) a block. Nothing is copied. */
export function BlockFinder({
  docs,
  index,
  flowIndex,
  space,
  roundMode,
  onJump,
  onInsert,
  insertBlocked,
  onClose,
}: {
  docs: DocMeta[];
  index: Map<string, OutlineEntry[]>;
  /** What is written on each flow's cells (found by the same search). */
  flowIndex: Map<string, FlowEntry[]>;
  space: string;
  roundMode: boolean;
  onJump: JumpTo;
  onInsert: JumpTo;
  /** Why inserting isn't allowed right now (null = allowed). */
  insertBlocked: string | null;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState(0);
  usePins(space); // re-render when pins change
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  const results = useMemo(() => {
    const all: Result[] = [];
    for (const doc of docs) {
      const entries = index.get(doc.id);
      if (entries) for (const h of searchEntries(entries, query)) all.push({ ...h, doc, flow: null });
      const cells = flowIndex.get(doc.id);
      if (cells) for (const h of searchFlow(cells, query)) all.push({ entry: null, target: null, score: h.score, doc, flow: h.entry });
    }
    // One row per jump target, best match first.
    const seen = new Set<string>();
    return all
      .sort((a, b) => b.score - a.score)
      .filter((h) => {
        const k = `${h.doc.id}:${h.flow ? h.flow.cellId : h.target!.id}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, 40);
  }, [docs, index, flowIndex, query]);

  useEffect(() => setSel(0), [query]);

  const jump = (h: Result) => {
    onJump(h.doc.id, h.flow ? h.flow.cellId : h.target!.id);
    onClose();
  };

  return (
    <dialog ref={ref} className="settings finder" onClose={onClose} onCancel={onClose}>
      <input
        className="finder-input"
        autoFocus
        value={query}
        placeholder={roundMode ? 'Search your round docs… (e.g. "perm" or "solvency deficit")' : 'Search your docs…'}
        aria-label="Search blocks"
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSel((s) => Math.min(results.length - 1, s + 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSel((s) => Math.max(0, s - 1));
          } else if (e.key === 'Enter' && results[sel]) {
            e.preventDefault();
            if (e.altKey || e.metaKey || e.ctrlKey) {
              if (!results[sel].flow) togglePin(space, { docId: results[sel].doc.id, blockId: results[sel].target!.id });
            } else jump(results[sel]);
          }
        }}
      />
      <p className="finder-hint muted small">
        ↑ ↓ to choose · Enter to jump · Ctrl+Enter (⌘↩ on Mac) to pin · Esc to close{roundMode ? ' · searching round docs only' : ''}
      </p>
      <ul className="finder-results" role="listbox" aria-label="Results">
        {query && results.length === 0 && <li className="muted finder-empty">No matches{index.size < docs.length ? ' yet (still loading docs)' : ''}.</li>}
        {results.map((h, i) => {
          if (h.flow) {
            return (
              <li key={`${h.doc.id}:${h.flow.cellId}`} role="option" aria-selected={i === sel} className={i === sel ? 'is-sel' : ''} onMouseEnter={() => setSel(i)}>
                <button type="button" className="finder-hit" onClick={() => jump(h)}>
                  <span className="finder-kind" data-kind="flow">
                    {h.flow.speech || 'Flow'}
                  </span>
                  <span className="finder-text">{h.flow.text}</span>
                  {h.flow.path.length > 0 && <span className="finder-match">answers: {h.flow.path[h.flow.path.length - 1].slice(0, 120)}</span>}
                  <span className="finder-path muted small">{[h.doc.title, h.flow.sheetName || 'Sheet', h.flow.speech].filter(Boolean).join(' › ')}</span>
                </button>
              </li>
            );
          }
          const t = h.target!;
          const pinned = isPinned(space, { docId: h.doc.id, blockId: t.id });
          return (
            <li key={`${h.doc.id}:${t.id}`} role="option" aria-selected={i === sel} className={i === sel ? 'is-sel' : ''} onMouseEnter={() => setSel(i)}>
              <button type="button" className="finder-hit" onClick={() => jump(h)}>
                <span className="finder-kind" data-kind={t.kind}>
                  {KIND_INFO[t.kind].label}
                </span>
                <span className="finder-text">{t.text || '(empty)'}</span>
                {h.entry !== t && <span className="finder-match">…{h.entry!.text.slice(0, 120)}</span>}
                <span className="finder-path muted small">{[h.doc.title, ...t.path].join(' › ')}</span>
              </button>
              {!roundMode && (
                <button
                  type="button"
                  className={'btn ghost small' + (insertBlocked ? ' is-blocked' : '')}
                  title={insertBlocked ?? 'Insert a copy below the caret in the doc you were in'}
                  onClick={() => {
                    onInsert(h.doc.id, t.id);
                    if (!insertBlocked) onClose();
                  }}
                >
                  Insert
                </button>
              )}
              <button
                type="button"
                className={'btn ghost small finder-pin' + (pinned ? ' is-on' : '')}
                aria-pressed={pinned}
                onClick={() => togglePin(space, { docId: h.doc.id, blockId: t.id })}
              >
                {pinned ? 'Pinned' : 'Pin'}
              </button>
            </li>
          );
        })}
      </ul>
    </dialog>
  );
}

/** The blocks a speaker plans to read, in order, in groups that can follow the flow. Read-only; tap to jump. */
export function PinBoard({
  space,
  docs,
  index,
  followDocId,
  onJump,
  onInsert,
  insertBlocked,
  onClose,
}: {
  space: string;
  docs: DocMeta[];
  index: Map<string, OutlineEntry[]>;
  /** The doc in the focused pane: when it's a flow, the tabs follow its sheet. */
  followDocId: string | null;
  onJump: JumpTo;
  onInsert: JumpTo;
  /** Why inserting isn't allowed right now (null = allowed). */
  insertBlocked: string | null;
  onClose: () => void;
}) {
  const roundMode = useRoundMode();
  const board = useBoard(space);
  const pins = visiblePins(board);
  const openFlows = useOpenFlows();
  const sheets = [...new Set([...openFlows.values()].flatMap((f) => f.sheets))];
  const lower = (x: string) => x.trim().toLowerCase();
  // Tabs: sheets that have pins, plus any other sheet names pins were given.
  const used = board.pins.map((p) => p.group).filter((g): g is string => !!g);
  const groups: string[] = [];
  for (const g of [...sheets, ...used]) if (used.some((u) => lower(u) === lower(g)) && !groups.some((x) => lower(x) === lower(g))) groups.push(g);
  // Choices for a pin's sheet: the flow's sheets, then names already used.
  const choices: string[] = [];
  for (const g of [...sheets, ...used]) if (!choices.some((x) => lower(x) === lower(g))) choices.push(g);
  const count = (g: string) => board.pins.filter((p) => p.group?.toLowerCase() === g.toLowerCase()).length;

  // Follow the flow: switching to sheet "T" shows the "T" group.
  const activeName = followDocId ? openFlows.get(followDocId)?.active ?? '' : '';
  useEffect(() => {
    if (activeName) followSheet(space, activeName);
  }, [activeName, space]);

  return (
    <aside className="pinboard" aria-label="Pinned blocks">
      <div className="pinboard-head">
        <strong>Pinned blocks</strong>
        <span className="tb-spacer" />
        {pins.length > 0 && (
          <button type="button" className="btn ghost small" onClick={() => clearPins(space)} title={board.selected ? `Unpin everything in ${board.selected}` : 'Unpin everything'}>
            Clear
          </button>
        )}
        <button type="button" className="icon-btn small" aria-label="Close pinned blocks" onClick={onClose}>
          <IconClose />
        </button>
      </div>
      <div className="pin-tabs" role="tablist" aria-label="Pin groups">
        <button type="button" role="tab" aria-selected={!board.selected} className={!board.selected ? 'is-on' : ''} onClick={() => selectGroup(space, '')}>
          All <span className="pin-count">{board.pins.length}</span>
        </button>
        {groups.map((g) => (
          <button
            key={g}
            type="button"
            role="tab"
            aria-selected={board.selected.toLowerCase() === g.toLowerCase()}
            className={board.selected.toLowerCase() === g.toLowerCase() ? 'is-on' : ''}
            onClick={() => selectGroup(space, g)}
          >
            {g} <span className="pin-count">{count(g)}</span>
          </button>
        ))}
      </div>
      <div className="pin-options">
        <label className="check">
          <input type="checkbox" checked={board.followFlow} onChange={(e) => setFollowFlow(space, e.target.checked)} /> Follow flow sheets
        </label>
      </div>
      {board.selected && <p className="muted small pin-note">Showing pins for the “{board.selected}” sheet. New pins go here too.</p>}
      {sheets.length === 0 && board.pins.length > 0 && (
        <p className="muted small pin-note">Open your flow (Flow view) to choose which sheet each pin answers.</p>
      )}
      {pins.length === 0 && (
        <p className="muted small pin-empty">
          {board.selected
            ? `Nothing pinned for “${board.selected}” yet.`
            : "Pin the blocks you might read: put the cursor in a section title, claim or analytic and press Pin in the toolbar (or pin from search, Ctrl+K / ⌘K). Then pick which flow sheet each pin answers, and the list follows the sheet you're on."}
        </p>
      )}
      <ol className="pin-list">
        {pins.map((p, i) => {
          const doc = docs.find((d) => d.id === p.docId);
          const entries = index.get(p.docId);
          const blocks = entries ? blockWithChildren(entries, p.blockId) : [];
          return (
            <li key={`${p.docId}:${p.blockId}`} className="pin">
              <div className="pin-top">
                <button type="button" className="pin-title" onClick={() => onJump(p.docId, p.blockId)} title="Jump to this block">
                  <span className="pin-num">{i + 1}</span>
                  <span className="muted small">{doc ? [doc.title, ...(blocks[0]?.path ?? [])].join(' › ') : 'Doc not available'}</span>
                </button>
                <button type="button" className="icon-btn small" aria-label="Move up" disabled={i === 0} onClick={() => movePin(space, p, -1)}>
                  ↑
                </button>
                <button type="button" className="icon-btn small" aria-label="Move down" disabled={i === pins.length - 1} onClick={() => movePin(space, p, 1)}>
                  ↓
                </button>
                <button type="button" className="icon-btn small" aria-label="Unpin" onClick={() => togglePin(space, p)}>
                  <IconClose />
                </button>
              </div>
              <div className="pin-body pp-doc" onClick={() => onJump(p.docId, p.blockId)}>
                {!entries && <p className="muted small">Loading…</p>}
                {entries && blocks.length === 0 && <p className="muted small">This block was deleted.</p>}
                {blocks.map((b) => (
                  <div key={b.id} className="pp-block" data-kind={b.kind}>
                    {b.text || '\u00a0'}
                  </div>
                ))}
              </div>
              <div className="pin-foot">
                <label className="pin-group-select">
                  <span className="sr-only">Flow sheet this answers</span>
                  <select value={choices.find((c) => lower(c) === lower(p.group ?? '')) ?? ''} onChange={(e) => setPinGroup(space, p, e.target.value || undefined)}>
                    <option value="">{choices.length ? 'Which sheet?' : 'No sheet (open your flow)'}</option>
                    {choices.map((g) => (
                      <option key={g} value={g}>
                        {sheets.some((x) => lower(x) === lower(g)) ? g : `${g} (not on flow)`}
                      </option>
                    ))}
                  </select>
                </label>
                {!roundMode && (
                  <button
                    type="button"
                    className={'btn ghost small pin-insert' + (insertBlocked ? ' is-blocked' : '')}
                    title={insertBlocked ?? 'Insert a copy below the caret in the doc you were in'}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => onInsert(p.docId, p.blockId)}
                  >
                    Insert
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}

/** Toolbar button: pin the claim (or heading) the caret is in. */
export function PinButton({ editor, docId, space }: { editor: Editor; docId: string; space: string }) {
  usePins(space);
  // Pin at the level the caret is on: a section title pins the whole
  // section, a claim pins it with its warrants, an analytic pins just itself.
  // A warrant or note pins the claim (or heading) it sits under.
  const target = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const { $from } = e.state.selection;
      if ($from.depth < 1) return null;
      const here = $from.index(0);
      const own = e.state.doc.child(here);
      if (own.type.name === 'block' && own.attrs.id && (isHeading(own.attrs.kind) || own.attrs.kind === 'analytic')) {
        return { id: own.attrs.id as string, kind: asKind(own.attrs.kind) };
      }
      for (let i = here - 1; i >= 0; i--) {
        const n = e.state.doc.child(i);
        if (n.type.name === 'block' && isHeading(n.attrs.kind) && n.attrs.id) return { id: n.attrs.id as string, kind: asKind(n.attrs.kind) };
      }
      return null;
    },
    equalityFn: (a, b) => a?.id === b?.id && a?.kind === b?.kind,
  });
  if (!target) return null;
  const pinned = isPinned(space, { docId, blockId: target.id });
  const what = target.kind === 'position' ? 'position' : target.kind === 'section' ? 'section' : target.kind === 'analytic' ? 'analytic' : 'claim';
  return (
    <button
      type="button"
      className={'tb-btn pin-btn' + (pinned ? ' is-on' : '')}
      title={pinned ? `Unpin this ${what}` : `Pin this ${what}${what === 'section' ? ' (everything up to the next section)' : what === 'claim' ? ' with its warrants' : ''}`}
      aria-pressed={pinned}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => togglePin(space, { docId, blockId: target.id })}
    >
      <IconPin /> {pinned ? `Pinned ${what}` : `Pin ${what}`}
    </button>
  );
}
