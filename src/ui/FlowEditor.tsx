import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCaret from '@tiptap/extension-collaboration-caret';
import type { WebsocketProvider } from 'y-websocket';
import { Placeholder } from '@tiptap/extensions';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import { useEffect, useState } from 'react';
import { toast } from '../editor/roundGuard';
import type * as Y from 'yjs';
import { BODY_FIELD, contentExtensions } from '../editor/extensions';
import { RoundGuard } from '../editor/roundGuard';
import { activeSheet, flowKey, FlowView, sheetKey } from '../editor/flowView';
import { KIND_INFO, asKind } from '../model/blocks';
import { SPEECH_INFO } from '../model/speeches';
import { IconPlus } from './icons';

export function FlowEditor({ ydoc, provider, docId, onEditor }: { ydoc: Y.Doc; provider: WebsocketProvider | null; docId: string; onEditor: (e: Editor | null) => void }) {
  const editor = useEditor(
    {
      extensions: [
        ...contentExtensions(),
        Collaboration.configure({ document: ydoc, field: BODY_FIELD }),
        RoundGuard.configure({ ydoc, docId }),
        ...(provider ? [CollaborationCaret.configure({ provider, user: provider.awareness.getLocalState()?.user ?? { name: 'Unnamed', color: '#888' } })] : []),
        FlowView,
        Placeholder.configure({
          placeholder: ({ node }) => `${KIND_INFO[asKind(node.attrs.kind)].label}…`,
        }),
      ],
      editorProps: { attributes: { spellcheck: 'true' } },
    },
    [ydoc, docId, provider],
  );

  useEffect(() => {
    onEditor(editor);
    return () => onEditor(null);
  }, [editor, onEditor]);

  return (
    <div className="flow-wrap">
      {editor && <SheetTabs editor={editor} />}
      <div className="flow-scroll">
        {editor && <ColumnHeaders editor={editor} />}
        <EditorContent editor={editor} className="flow-grid-host" />
      </div>
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
            title="Double-click to rename"
            onClick={(e) => (e.detail >= 2 ? setRenaming(s.key) : editor.commands.showSheet(s.key))}
          >
            <span className="sheet-dot" />
            {s.title || 'Untitled'}
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
  const { columns, sheets } = useSheets(editor);
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
    <div className="flow-head" style={{ ['--fl-cols' as string]: columns.length }}>
      {columns.map((c) => (
        <div key={c} className={`flow-col-head fl-${SPEECH_INFO[c].side}`} title={SPEECH_INFO[c].name}>
          {c}
        </div>
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
