import type { Editor } from '@tiptap/react';
import { useEditorState } from '@tiptap/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { KIND_INFO, isHeading } from '../model/blocks';
import { blockWithChildren, searchEntries, type OutlineEntry, type SearchHit } from '../model/outline';
import type { DocMeta } from '../store/docs';
import { clearPins, isPinned, movePin, togglePin, usePins } from '../store/pins';
import { IconClose, IconPin } from './icons';

export type JumpTo = (docId: string, blockId: string) => void;

/** Ctrl/Cmd+K: search the prep and jump to (or pin) a block. Nothing is copied. */
export function BlockFinder({
  docs,
  index,
  space,
  roundMode,
  onJump,
  onClose,
}: {
  docs: DocMeta[];
  index: Map<string, OutlineEntry[]>;
  space: string;
  roundMode: boolean;
  onJump: JumpTo;
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

/** The blocks a speaker plans to read, in order. Read-only; tap to jump. */
export function PinBoard({
  space,
  docs,
  index,
  onJump,
  onClose,
}: {
  space: string;
  docs: DocMeta[];
  index: Map<string, OutlineEntry[]>;
  onJump: JumpTo;
  onClose: () => void;
}) {
  const pins = usePins(space);
  return (
    <aside className="pinboard" aria-label="Pinned blocks">
      <div className="pinboard-head">
        <strong>Pinned blocks</strong>
        <span className="tb-spacer" />
        {pins.length > 0 && (
          <button type="button" className="btn ghost small" onClick={() => clearPins(space)}>
            Clear
          </button>
        )}
        <button type="button" className="icon-btn small" aria-label="Close pinned blocks" onClick={onClose}>
          <IconClose />
        </button>
      </div>
      {pins.length === 0 && (
        <p className="muted small pin-empty">
          Line up the blocks you'll read in your speech. Pin a claim from the toolbar's pin button, or from the search (Ctrl+K / ⌘K).
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
                <button type="button" className="icon-btn small" aria-label="Move up" disabled={i === 0} onClick={() => movePin(space, i, -1)}>
                  ↑
                </button>
                <button type="button" className="icon-btn small" aria-label="Move down" disabled={i === pins.length - 1} onClick={() => movePin(space, i, 1)}>
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
                    {b.text || ' '}
                  </div>
                ))}
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
