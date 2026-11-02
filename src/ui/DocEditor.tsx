import Collaboration from '@tiptap/extension-collaboration';
import { Placeholder } from '@tiptap/extensions';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import { useEffect } from 'react';
import type * as Y from 'yjs';
import { Collapse } from '../editor/collapse';
import { SpeechTags } from '../editor/speechTags';
import { computeFlow, readBlocks, sheetAt } from '../model/flow';
import { SPEECHES, isSpeech, type Speech } from '../model/speeches';
import { isMac, styleKeyLabel } from '../editor/shortcuts';
import { useSettings } from '../settings/settings';
import { BODY_FIELD, contentExtensions } from '../editor/extensions';
import { RoundGuard } from '../editor/roundGuard';
import { BLOCK_KINDS, KIND_INFO, asKind, isHeading, levelOf, type BlockKind } from '../model/blocks';
import {
  IconFold,
  IconHighlight,
  IconRedo,
  IconUndo,
  IconUnfold,
} from './icons';

export function DocEditor({ ydoc, docId, onEditor }: { ydoc: Y.Doc; docId: string; onEditor: (e: Editor | null) => void }) {
  const editor = useEditor(
    {
      extensions: [
        ...contentExtensions(),
        Collaboration.configure({ document: ydoc, field: BODY_FIELD }),
        RoundGuard.configure({ ydoc, docId }),
        Collapse,
        SpeechTags,
        Placeholder.configure({
          placeholder: ({ node }) => `${KIND_INFO[asKind(node.attrs.kind)].label}…`,
        }),
      ],
      editorProps: { attributes: { class: 'pp-doc', spellcheck: 'true' } },
    },
    [ydoc, docId],
  );

  useEffect(() => {
    onEditor(editor);
    return () => onEditor(null);
  }, [editor, onEditor]);

  return <EditorContent editor={editor} className="pp-doc-scroll" />;
}

export const MOD = isMac ? '⌘' : 'Ctrl';

/** The speech a line will show under on the flow, and whether it was chosen by hand. */
function speechInfo(e: Editor) {
  const { $from } = e.state.selection;
  const node = $from.parent;
  const explicit = isSpeech(node.attrs.speech) ? (node.attrs.speech as Speech) : null;
  if ($from.depth < 1) return { explicit, effective: null as Speech | null, inSheet: false };
  const layout = computeFlow(readBlocks(e.state.doc));
  const pos = $from.before(1);
  return { explicit, effective: layout.speechAt.get(pos) ?? null, inSheet: !!sheetAt(layout, pos) };
}

export function Toolbar({ editor, view = 'doc' }: { editor: Editor; view?: 'doc' | 'flow' }) {
  useSettings(); // re-render when the style keys change
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      ...speechInfo(e),
      kind: asKind(e.state.selection.$from.parent.attrs.kind),
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      highlight: e.isActive('highlight'),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });

  const btn = (active: boolean, label: string, title: string, run: () => void, content?: React.ReactNode) => (
    <button
      type="button"
      className={'tb-btn' + (active ? ' is-on' : '')}
      title={title}
      aria-label={title}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={run}
    >
      {content ?? label}
    </button>
  );

  return (
    <div className="toolbar" role="toolbar">
      <label className="style-select" data-kind={s.kind}>
        <span className="sr-only">Style</span>
        <select
          value={s.kind}
          onChange={(e) => editor.chain().focus().setBlockKind(e.target.value as BlockKind).run()}
        >
          {BLOCK_KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_INFO[k].label}  ({styleKeyLabel(k)})
            </option>
          ))}
        </select>
      </label>
      {s.kind !== 'position' && s.kind !== 'section' && (
        <label className="speech-select" title="Which speech's column this line goes in on the flow">
          <span className="sr-only">Speech</span>
          <select
            value={s.explicit ?? ''}
            disabled={!s.inSheet}
            onChange={(e) => editor.chain().focus().setBlockSpeech(e.target.value ? (e.target.value as Speech) : null).run()}
          >
            <option value="">{s.inSheet ? `Auto${s.effective && !s.explicit ? ` (${s.effective})` : ''}` : 'No sheet'}</option>
            {SPEECHES.map((sp) => (
              <option key={sp} value={sp}>
                {sp}
              </option>
            ))}
          </select>
        </label>
      )}
      <span className="tb-sep" />
      {btn(s.bold, 'B', `Bold (${MOD}+B)`, () => editor.chain().focus().toggleBold().run(), <b>B</b>)}
      {btn(s.italic, 'I', `Italic (${MOD}+I)`, () => editor.chain().focus().toggleItalic().run(), <i>I</i>)}
      {btn(s.underline, 'U', `Underline (${MOD}+U)`, () => editor.chain().focus().toggleUnderline().run(), <u>U</u>)}
      {btn(s.strike, 'S', 'Strikethrough', () => editor.chain().focus().toggleStrike().run(), <s>S</s>)}
      {btn(s.highlight, 'H', `Highlight (${MOD}+Shift+H)`, () => editor.chain().focus().toggleHighlight().run(), <IconHighlight />)}
      {view === 'doc' && (
        <>
          <span className="tb-sep" />
          {btn(false, '', 'Collapse to claims', () => editor.chain().collapseAll(3).run(), <IconFold />)}
          {btn(false, '', 'Expand all', () => editor.chain().expandAll().run(), <IconUnfold />)}
        </>
      )}
      {view === 'flow' && (
        <>
          <span className="tb-sep" />
          <span className="tb-hint">Tab: next speech · {MOD}+Enter: new row</span>
        </>
      )}
      <span className="tb-spacer" />
      <button type="button" className="tb-btn" title={`Undo (${MOD}+Z)`} aria-label="Undo" disabled={!s.canUndo} onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().undo().run()}>
        <IconUndo />
      </button>
      <button type="button" className="tb-btn" title={`Redo (${MOD}+Shift+Z)`} aria-label="Redo" disabled={!s.canRedo} onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().redo().run()}>
        <IconRedo />
      </button>
    </div>
  );
}

export interface OutlineItem {
  id: string;
  kind: BlockKind;
  text: string;
  pos: number;
}

export function outlineItems(editor: Editor): OutlineItem[] {
  const items: OutlineItem[] = [];
  editor.state.doc.forEach((node, pos) => {
    if (node.type.name === 'block' && isHeading(node.attrs.kind) && node.attrs.id) {
      items.push({ id: node.attrs.id, kind: asKind(node.attrs.kind), text: node.textContent, pos });
    }
  });
  return items;
}

export function Outline({ editor }: { editor: Editor }) {
  const data = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const items = outlineItems(e);
      const at = e.state.selection.from;
      let current: string | null = null;
      for (const it of items) if (it.pos < at) current = it.id;
      return { items, current };
    },
    equalityFn: (a, b) => JSON.stringify(a) === JSON.stringify(b),
  });

  const go = (it: OutlineItem) => {
    const node = editor.state.doc.nodeAt(it.pos);
    if (!node) return;
    editor.chain().focus().setTextSelection(it.pos + 1 + node.content.size).run();
    const dom = editor.view.nodeDOM(it.pos);
    if (dom instanceof HTMLElement) dom.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  return (
    <nav className="outline" aria-label="Outline">
      <div className="outline-title">Outline</div>
      {data.items.length === 0 && <p className="outline-empty">Headings (position titles, section titles, claims) show up here.</p>}
      <ul>
        {data.items.map((it) => (
          <li key={it.id}>
            <button
              type="button"
              className={'outline-item' + (it.id === data.current ? ' is-current' : '')}
              data-level={levelOf(it.kind)}
              onClick={() => go(it)}
            >
              {it.text || <em>{KIND_INFO[it.kind].label}</em>}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
