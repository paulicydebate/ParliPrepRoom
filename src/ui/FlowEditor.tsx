import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCaret from '@tiptap/extension-collaboration-caret';
import type { WebsocketProvider } from 'y-websocket';
import { Placeholder } from '@tiptap/extensions';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { blockWithChildren } from '../model/outline';
import { useBoard } from '../store/pins';
import { useLibrary } from './useLibrary';
import { setFlowTheme, useFlowTheme } from '../store/flowTheme';
import { columnTracks } from '../model/flowLayout';
import { useDocs } from './hooks';
import { useRoundMode } from '../store/roundMode';
import { toast } from '../editor/roundGuard';
import type * as Y from 'yjs';
import { BODY_FIELD, contentExtensions } from '../editor/extensions';
import { RoundGuard } from '../editor/roundGuard';
import { activeSheet, flowKey, FlowView, sheetKey } from '../editor/flowView';
import { KIND_INFO, asKind } from '../model/blocks';
import { SPEECH_INFO } from '../model/speeches';
import { ColorwayPicker } from './ColorwayPicker';
import { IconClose, IconPin, IconPlus, IconThread } from './icons';

export function FlowEditor({
  ydoc,
  provider,
  docId,
  space,
  carets,
  onEditor,
}: {
  ydoc: Y.Doc;
  provider: WebsocketProvider | null;
  docId: string;
  /** See DocEditor: only one editor per document shares its cursor. */
  carets: boolean;
  /** Current team (or 'personal'), for pins. */
  space: string;
  onEditor: (e: Editor | null) => void;
}) {
  // The pins column lives inside the grid; React fills this element.
  const pinPanel = useMemo(() => document.createElement('div'), []);
  const editor = useEditor(
    {
      extensions: [
        ...contentExtensions(),
        Collaboration.configure({ document: ydoc, field: BODY_FIELD }),
        RoundGuard.configure({ ydoc, docId }),
        ...(provider && carets ? [CollaborationCaret.configure({ provider, user: provider.awareness.getLocalState()?.user ?? { name: 'Unnamed', color: '#888' } })] : []),
        FlowView.configure({ pinPanel }),
        Placeholder.configure({
          placeholder: ({ node }) => `${KIND_INFO[asKind(node.attrs.kind)].label}…`,
        }),
      ],
      editorProps: { attributes: { spellcheck: 'true' } },
    },
    [ydoc, docId, provider, carets],
  );

  useEffect(() => {
    onEditor(editor);
    return () => onEditor(null);
  }, [editor, onEditor]);

  const flowTheme = useFlowTheme();
  return (
    <div className="flow-wrap" data-flow-theme={flowTheme}>
      {editor && <SheetTabs editor={editor} />}
      <div className="flow-scroll">
        {editor && <ColumnHeaders editor={editor} />}
        <div className="flow-grid-wrap">
          <EditorContent editor={editor} className="flow-grid-host" />
          {editor && <FlowThreads editor={editor} />}
        </div>
      </div>
      {editor && createPortal(<PinColumn editor={editor} space={space} />, pinPanel)}
    </div>
  );
}

function useSheets(editor: Editor) {
  return useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const fs = flowKey.getState(e.state);
      const active = activeSheet(fs);
      return {
        sheets: (fs?.layout.sheets ?? []).map((s) => ({ key: sheetKey(s), title: s.title, side: s.side })),
        active: active ? sheetKey(active) : null,
        columns: active?.columns ?? [],
        side: active?.side ?? 'gov',
        title: active?.title ?? '',
        pinCol: fs?.pinCol ?? null,
        tracks: columnTracks(active, fs?.pinCol ?? null),
      };
    },
    equalityFn: (a, b) => JSON.stringify(a) === JSON.stringify(b),
  });
}

function SheetTabs({ editor }: { editor: Editor }) {
  const { sheets, active } = useSheets(editor);
  const [renaming, setRenaming] = useState<string | null>(null);

  return (
    <div className="sheet-tabs" role="tablist" aria-label="Sheets">
      {sheets.map((s) =>
        renaming === s.key ? (
          <input
            key={s.key}
            className="sheet-rename"
            autoFocus
            defaultValue={s.title}
            aria-label="Sheet name"
            onBlur={(e) => {
              editor.commands.renameSheet(s.key, e.target.value.trim());
              setRenaming(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') setRenaming(null);
            }}
          />
        ) : (
          <button
            key={s.key}
            type="button"
            role="tab"
            aria-selected={s.key === active}
            className={`sheet-tab fl-${s.side}` + (s.key === active ? ' is-on' : '')}
            title={`${s.title || 'Untitled'} (double-click to rename)`}
            onClick={(e) => (e.detail >= 2 ? setRenaming(s.key) : editor.commands.showSheet(s.key))}
          >
            <span className="sheet-dot" />
            <span className="sheet-name">{s.title || 'Untitled'}</span>
          </button>
        ),
      )}
      {active && (
        <label className="sheet-side" title="Whose sheet this is">
          <span className="sr-only">Side of this sheet</span>
          <select
            value={sheets.find((s) => s.key === active)?.side ?? 'gov'}
            onChange={(e) => editor.commands.setSheetSide(active, e.target.value as 'gov' | 'opp')}
          >
            <option value="gov">Gov sheet</option>
            <option value="opp">Opp sheet</option>
          </select>
        </label>
      )}
      {active && <LinkButtons editor={editor} />}
      <ColorsButton />
      {active && <DeleteSheetButton editor={editor} sheetKey={active} title={sheets.find((s) => s.key === active)?.title ?? ''} />}
      <span className="tb-spacer" />
      <button type="button" className="btn ghost small" onClick={() => editor.chain().addSheet('gov').focus().run()}>
        <IconPlus /> Gov
      </button>
      <button type="button" className="btn ghost small" onClick={() => editor.chain().addSheet('opp').focus().run()}>
        <IconPlus /> Opp
      </button>
    </div>
  );
}

function ColumnHeaders({ editor }: { editor: Editor }) {
  const { columns, sheets, pinCol, tracks } = useSheets(editor);
  if (!sheets.length) {
    return (
      <div className="flow-empty">
        <p>No sheets yet. Every Position title in the doc becomes a sheet.</p>
        <p>
          Add one with <strong>+ Gov</strong> or <strong>+ Opp</strong> above, or type a Position title in the doc view.
        </p>
      </div>
    );
  }
  return (
    <div className="flow-head" style={{ ['--fl-cols' as string]: columns.length + (pinCol ? 1 : 0), ['--fl-template' as string]: tracks.template, ['--fl-minw' as string]: tracks.minWidth }}>
      {columns.map((c, i) => (
        <Fragment key={c}>
          <div className={`flow-col-head fl-${SPEECH_INFO[c].side}` + (tracks.used[i] ? '' : ' is-narrow')} title={SPEECH_INFO[c].name}>
            <span>{c}</span>
            <button
              type="button"
              className={'col-pin-btn' + (pinCol === i + 1 ? ' is-on' : '')}
              aria-pressed={pinCol === i + 1}
              title={pinCol === i + 1 ? 'Hide pins' : `Show your pins for this sheet next to the ${c}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor.commands.togglePinColumn(i + 1)}
            >
              <IconPin />
            </button>
          </div>
          {pinCol === i + 1 && <div className="flow-col-head pins-head">Pins</div>}
        </Fragment>
      ))}
    </div>
  );
}

/** Delete the sheet in view. Asks once more if the sheet has anything on it. */
function DeleteSheetButton({ editor, sheetKey: key, title }: { editor: Editor; sheetKey: string; title: string }) {
  const [confirm, setConfirm] = useState(false);
  useEffect(() => setConfirm(false), [key]);
  useEffect(() => {
    if (!confirm) return;
    const t = setTimeout(() => setConfirm(false), 4000);
    return () => clearTimeout(t);
  }, [confirm]);
  const isEmpty = () => {
    const sheet = flowKey.getState(editor.state)?.layout.sheets.find((s) => sheetKey(s) === key);
    return !sheet || sheet.placements.every((p) => !editor.state.doc.nodeAt(p.pos)?.textContent.trim());
  };
  return (
    <button
      type="button"
      className={'btn ghost small sheet-delete' + (confirm ? ' confirm' : '')}
      title="Delete this sheet and everything on it (Undo brings it back)"
      onClick={() => {
        if (!confirm && !isEmpty()) {
          setConfirm(true);
          return;
        }
        setConfirm(false);
        editor.chain().focus().deleteSheet(key).run();
        toast(`Deleted “${title || 'Untitled'}”. Press ${navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+Z to undo.`);
      }}
    >
      {confirm ? `Delete “${title || 'Untitled'}” and everything on it?` : 'Delete sheet'}
    </button>
  );
}

/** Pins for the sheet in view, shown as a column in the flow. Read-only; tap to open the block. */
function PinColumn({ editor, space }: { editor: Editor; space: string }) {
  const { title, pinCol } = useSheets(editor);
  const board = useBoard(space);
  const roundMode = useRoundMode();
  const docs = useDocs();
  const lower = (x: string) => x.trim().toLowerCase();
  // In Round Mode, only pins from round docs (typed by hand during prep).
  const pins = board.pins.filter(
    (p) => p.group && lower(p.group) === lower(title) && (!roundMode || docs?.find((d) => d.id === p.docId)?.round),
  );
  const { index } = useLibrary([...new Set(pins.map((p) => p.docId))], pinCol !== null);
  if (pinCol === null) return null;
  return (
    <div className="fl-pins-inner">
      {pins.length === 0 && (
        <p className="muted small">
          No pins for “{title || 'this sheet'}” yet. Pin blocks in your prep doc, then choose “{title || 'this sheet'}” as their sheet in the pin panel.
        </p>
      )}
      {pins.map((p, i) => {
        const entries = index.get(p.docId);
        const blocks = entries ? blockWithChildren(entries, p.blockId) : [];
        return (
          <button
            key={`${p.docId}:${p.blockId}`}
            type="button"
            className="fl-pin"
            title="Open this block in your prep"
            onClick={() => window.dispatchEvent(new CustomEvent('pp-jump', { detail: { docId: p.docId, blockId: p.blockId } }))}
          >
            <span className="pin-num">{i + 1}</span>
            <span className="fl-pin-body">
              {!entries && <span className="muted small">Loading…</span>}
              {entries && blocks.length === 0 && <span className="muted small">This block was deleted.</span>}
              {blocks.map((b) => (
                <span key={b.id} className="pp-block" data-kind={b.kind}>
                  {b.text || '\u00a0'}
                </span>
              ))}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** "Colors" in the sheet bar: a quick window to switch Gov/Opp colors. */
function ColorsButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn ghost small colors-btn" title="Change Gov and Opp colors" onClick={() => setOpen(true)}>
        <span className="mini-swatch" aria-hidden="true">
          <span style={{ background: 'var(--gov)' }} />
          <span style={{ background: 'var(--opp)' }} />
        </span>
        Colors
      </button>
      {open && createPortal(<ColorsDialog onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

function ColorsDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const flowTheme = useFlowTheme();
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="settings colors-dialog"
      onClose={onClose}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="settings-head">
        <h2>Gov &amp; Opp colors</h2>
        <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
          <IconClose />
        </button>
      </div>
      <p className="muted">Saved in this browser. Your partner can pick different colors for the same flow.</p>
      <ColorwayPicker />
      <label className="flow-theme-opt">
        <input type="checkbox" checked={flowTheme === 'night'} onChange={(e) => setFlowTheme(e.target.checked ? 'night' : 'app')} />
        Dark flow (a night-mode look for the flow, even in the light theme)
      </label>
      <div className="settings-foot">
        <span />
        <button type="button" className="btn primary" onClick={onClose}>
          Done
        </button>
      </div>
    </dialog>
  );
}

/** Link / Unlink in the sheet bar, and the hint while linking. */
function LinkButtons({ editor }: { editor: Editor }) {
  const st = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const fs = flowKey.getState(e.state);
      const sheet = activeSheet(fs);
      const $from = e.state.selection.$from;
      const pos = $from.depth >= 1 ? $from.before(1) : -1;
      return { linking: !!fs?.linking, linked: !!sheet?.links.some((l) => l.to === pos), pos };
    },
  });
  const mac = typeof navigator !== 'undefined' && navigator.platform.includes('Mac');
  return (
    <>
      <button
        type="button"
        className={'btn ghost small link-btn' + (st.linking ? ' is-on' : '')}
        aria-pressed={st.linking}
        title={`Link the selected claims to the argument they answer (${mac ? '⌘' : 'Ctrl'}+Shift+L)`}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => (st.linking ? editor.commands.cancelLinking() : editor.commands.startLinking())}
      >
        <IconThread /> {st.linking ? 'Cancel link' : 'Link'}
      </button>
      {st.linking && <span className="link-hint">Click the argument these answer (Esc cancels)</span>}
      {st.linked && !st.linking && (
        <button
          type="button"
          className="btn ghost small"
          title="Unlink this claim from the argument it answers"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().unlinkBlock(st.pos).focus().run()}
        >
          Unlink
        </button>
      )}
    </>
  );
}

/** Threads: a line from each argument into the claims that answer it, drawn from where they are on screen. */
function FlowThreads({ editor }: { editor: Editor }) {
  const svg = useRef<SVGSVGElement>(null);
  const [paths, setPaths] = useState<{ d: string; side: string; on: boolean; key: string }[]>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let raf = 0;
    const again = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setTick((t) => t + 1));
    };
    editor.on('update', again);
    editor.on('selectionUpdate', again);
    window.addEventListener('resize', again);
    const ro = new ResizeObserver(again);
    ro.observe(editor.view.dom);
    return () => {
      cancelAnimationFrame(raf);
      editor.off('update', again);
      editor.off('selectionUpdate', again);
      window.removeEventListener('resize', again);
      ro.disconnect();
    };
  }, [editor]);

  useLayoutEffect(() => {
    const wrap = svg.current?.parentElement;
    const sheet = activeSheet(flowKey.getState(editor.state));
    if (!wrap || !sheet || !sheet.links.length) {
      setPaths((p) => (p.length ? [] : p));
      return;
    }
    const origin = wrap.getBoundingClientRect();
    const $from = editor.state.selection.$from;
    const here = $from.depth >= 1 ? $from.before(1) : -1;
    const boxes = [...editor.view.dom.querySelectorAll<HTMLElement>(':scope > .fl-cell[data-first]')].map((el) => ({
      el,
      first: Number(el.dataset.first),
      last: Number(el.dataset.last),
    }));
    const boxOf = (pos: number) => boxes.find((b) => pos >= b.first && pos <= b.last);
    const out: { d: string; side: string; on: boolean; key: string }[] = [];
    // Everything linked to one argument lights up together when you are in the argument or any of its answers.
    const lit = new Set<number>();
    for (const l of sheet.links) {
      const a = boxOf(l.from);
      const b = boxOf(l.to);
      if ((a && here >= a.first && here <= a.last) || (b && here >= b.first && here <= b.last)) lit.add(l.from);
    }
    for (const l of sheet.links) {
      const a = boxOf(l.from);
      const b = boxOf(l.to);
      if (!a || !b) continue;
      const ra = a.el.getBoundingClientRect();
      const rb = b.el.getBoundingClientRect();
      if (!ra.width || !rb.width) continue;
      // From the middle of the right edge of the argument to the middle of the left edge of the answer.
      const x1 = ra.right - origin.left;
      const y1 = ra.top - origin.top + Math.min(ra.height / 2, 18);
      const x2 = rb.left - origin.left;
      const y2 = rb.top - origin.top + Math.min(rb.height / 2, 18);
      const dx = Math.max(12, (x2 - x1) * 0.55);
      const d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
      const on = lit.has(l.from);
      out.push({ d, side: a.el.classList.contains('fl-opp') ? 'opp' : 'gov', on, key: `${l.from}-${l.to}` });
    }
    setPaths(out);
  }, [editor, tick]);

  return (
    <svg ref={svg} className="flow-threads" aria-hidden="true">
      {paths.map((p) => (
        <path key={p.key} d={p.d} className={`thread fl-${p.side}` + (p.on ? ' is-on' : '')} />
      ))}
    </svg>
  );
}
