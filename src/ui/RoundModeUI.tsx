import type { Editor } from '@tiptap/react';
import { useEditorState } from '@tiptap/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { KIND_INFO, isHeading } from '../model/blocks';
import { blockWithChildren, searchEntries, type OutlineEntry, type SearchHit } from '../model/outline';
import type { DocMeta } from '../store/docs';
import { useRoundMode } from '../store/roundMode';
import { addGroup, clearPins, followSheet, isPinned, movePin, removeGroup, selectGroup, setFollowFlow, setPinGroup, togglePin, useBoard, usePins, visiblePins } from '../store/pins';
import { activeSheet, flowKey } from '../editor/flowView';
import { IconClose, IconPin } from './icons';

export type JumpTo = (docId: string, blockId: string) => void;

/** Ctrl/Cmd+K: search the prep and jump to (or pin) a block. Nothing is copied. */
export function BlockFinder({
  docs,
  index,
  space,
  roundMode,
  onJump,
  onInsert,
  insertBlocked,
  onClose,
}: {
  docs: DocMeta[];
  index: Map<string, OutlineEntry[]>;
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
    const all: (SearchHit & { doc: DocMeta })[] = [];
    for (const doc of docs) {
      const entries = index.get(doc.id);
      if (!entries) continue;
      for (const h of searchEntries(entries, query)) all.push({ ...h, doc });
    }
    // One row per jump target, best match first.
    const seen = new Set<string>();
    return all
      .sort((a, b) => b.score - a.score)
      .filter((h) => {
        const k = `${h.doc.id}:${h.target.id}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, 40);
  }, [docs, index, query]);

  useEffect(() => setSel(0), [query]);

  const jump = (h: (typeof results)[number]) => {
    onJump(h.doc.id, h.target.id);
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
            if (e.altKey || e.metaKey || e.ctrlKey) togglePin(space, { docId: results[sel].doc.id, blockId: results[sel].target.id });
            else jump(results[sel]);
          }
        }}
      />
      <p className="finder-hint muted small">
        ↑ ↓ to choose · Enter to jump · Ctrl+Enter (⌘↩ on Mac) to pin · Esc to close{roundMode ? ' · searching round docs only' : ''}
      </p>
      <ul className="finder-results" role="listbox" aria-label="Results">
        {query && results.length === 0 && <li className="muted finder-empty">No matches{index.size < docs.length ? ' yet (still loading docs)' : ''}.</li>}
        {results.map((h, i) => {
          const pinned = isPinned(space, { docId: h.doc.id, blockId: h.target.id });
          return (
            <li key={`${h.doc.id}:${h.target.id}`} role="option" aria-selected={i === sel} className={i === sel ? 'is-sel' : ''} onMouseEnter={() => setSel(i)}>
              <button type="button" className="finder-hit" onClick={() => jump(h)}>
                <span className="finder-kind" data-kind={h.target.kind}>
                  {KIND_INFO[h.target.kind].label}
                </span>
                <span className="finder-text">{h.target.text || '(empty)'}</span>
                {h.entry !== h.target && <span className="finder-match">…{h.entry.text.slice(0, 120)}</span>}
                <span className="finder-path muted small">{[h.doc.title, ...h.target.path].join(' › ')}</span>
              </button>
              {!roundMode && (
                <button
                  type="button"
                  className={'btn ghost small' + (insertBlocked ? ' is-blocked' : '')}
                  title={insertBlocked ?? 'Insert a copy below the caret in the doc you were in'}
                  onClick={() => {
                    onInsert(h.doc.id, h.target.id);
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
                onClick={() => togglePin(space, { docId: h.doc.id, blockId: h.target.id })}
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
  followEditor,
  onJump,
  onInsert,
  insertBlocked,
  onClose,
}: {
  space: string;
  docs: DocMeta[];
  index: Map<string, OutlineEntry[]>;
  /** Editor of the focused pane: when it's a flow, the tabs follow its sheet. */
  followEditor: Editor | null;
  onJump: JumpTo;
  onInsert: JumpTo;
  /** Why inserting isn't allowed right now (null = allowed). */
  insertBlocked: string | null;
  onClose: () => void;
}) {
  const roundMode = useRoundMode();
  const board = useBoard(space);
  const [adding, setAdding] = useState(false);
  const pins = visiblePins(board);
  const groups = [...board.groups];
  for (const p of board.pins) if (p.group && !groups.some((g) => g.toLowerCase() === p.group!.toLowerCase())) groups.push(p.group);
  const count = (g: string) => board.pins.filter((p) => p.group?.toLowerCase() === g.toLowerCase()).length;

  // Follow the flow: switching to sheet "T" shows the "T" group.
  useEffect(() => {
    if (!followEditor) return;
    let last = '';
    const check = () => {
      const st = flowKey.getState(followEditor.state);
      const title = st ? activeSheet(st)?.title ?? '' : '';
      if (title && title !== last) {
        last = title;
        followSheet(space, title);
      }
    };
    check();
    followEditor.on('transaction', check);
    return () => {
      followEditor.off('transaction', check);
    };
  }, [followEditor, space]);

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
        {adding ? (
          <input
            className="pin-group-input"
            autoFocus
            placeholder="e.g. T"
            aria-label="New group name"
            onBlur={(e) => {
              addGroup(space, e.target.value);
              setAdding(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') setAdding(false);
            }}
          />
        ) : (
          <button type="button" className="pin-tab-add" onClick={() => setAdding(true)} title="New group (name it like a flow sheet, e.g. T or DA 1)">
            + Group
          </button>
        )}
      </div>
      <div className="pin-options">
        <label className="check">
          <input type="checkbox" checked={board.followFlow} onChange={(e) => setFollowFlow(space, e.target.checked)} /> Follow flow sheets
        </label>
        {board.selected && (
          <button type="button" className="btn ghost small" onClick={() => removeGroup(space, board.selected)} title="Delete this group (its pins stay, ungrouped)">
            Delete group
          </button>
        )}
      </div>
      {board.selected && <p className="muted small pin-note">New pins go into “{board.selected}”.</p>}
      {pins.length === 0 && (
        <p className="muted small pin-empty">
          {board.selected
            ? `Nothing pinned in “${board.selected}” yet. With this tab open, pin answers from the toolbar's Pin button or from search (Ctrl+K / ⌘K).`
            : "Line up the blocks you'll read in your speech. Pin a claim from the toolbar's Pin button, or from search (Ctrl+K / ⌘K). Make groups named like your flow sheets (T, DA 1…) and the list follows the sheet you're on."}
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
                  <span className="sr-only">Group</span>
                  <select
                    value={p.group ?? ''}
                    onChange={(e) => {
                      if (e.target.value === '__new') {
                        const name = window.prompt('New group name (e.g. T, DA 1)');
                        if (name) setPinGroup(space, p, name);
                      } else setPinGroup(space, p, e.target.value || undefined);
                    }}
                  >
                    <option value="">No group</option>
                    {groups.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                    <option value="__new">New group…</option>
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
  const target = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const { $from } = e.state.selection;
      if ($from.depth < 1) return null;
      const here = $from.index(0);
      for (let i = here; i >= 0; i--) {
        const n = e.state.doc.child(i);
        if (n.type.name === 'block' && isHeading(n.attrs.kind) && n.attrs.id) return n.attrs.id as string;
      }
      return null;
    },
  });
  if (!target) return null;
  const pinned = isPinned(space, { docId, blockId: target });
  return (
    <button
      type="button"
      className={'tb-btn pin-btn' + (pinned ? ' is-on' : '')}
      title={pinned ? 'Unpin this claim' : 'Pin this claim to your speech list'}
      aria-pressed={pinned}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => togglePin(space, { docId, blockId: target })}
    >
      <IconPin /> {pinned ? 'Pinned' : 'Pin'}
    </button>
  );
}
