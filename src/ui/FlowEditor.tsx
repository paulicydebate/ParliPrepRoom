import Collaboration from '@tiptap/extension-collaboration';
import { Placeholder } from '@tiptap/extensions';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import { useEffect, useState } from 'react';
import type * as Y from 'yjs';
import { BODY_FIELD, contentExtensions } from '../editor/extensions';
import { activeSheet, flowKey, FlowView, sheetKey } from '../editor/flowView';
import { KIND_INFO, asKind } from '../model/blocks';
import { SPEECH_INFO } from '../model/speeches';
import { IconPlus } from './icons';

export function FlowEditor({ ydoc, onEditor }: { ydoc: Y.Doc; onEditor: (e: Editor | null) => void }) {
  const editor = useEditor(
    {
      extensions: [
        ...contentExtensions(),
        Collaboration.configure({ document: ydoc, field: BODY_FIELD }),
        FlowView,
        Placeholder.configure({
          placeholder: ({ node }) => `${KIND_INFO[asKind(node.attrs.kind)].label}…`,
        }),
      ],
      editorProps: { attributes: { spellcheck: 'true' } },
    },
    [ydoc],
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
            onClick={() => editor.chain().showSheet(s.key).focus().run()}
            onDoubleClick={() => setRenaming(s.key)}
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
