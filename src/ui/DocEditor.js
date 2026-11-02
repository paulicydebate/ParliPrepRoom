import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCaret from '@tiptap/extension-collaboration-caret';
import { Placeholder } from '@tiptap/extensions';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import { useEffect } from 'react';
import { Collapse } from '../editor/collapse';
import { FLOW_MARKS } from '../model/marks';
import { SpeechTags } from '../editor/speechTags';
import { computeFlow, readBlocks, sheetAt } from '../model/flow';
import { SPEECHES, isSpeech } from '../model/speeches';
import { isMac, styleKeyLabel } from '../editor/shortcuts';
import { useSettings } from '../settings/settings';
import { BODY_FIELD, contentExtensions } from '../editor/extensions';
import { RoundGuard } from '../editor/roundGuard';
import { BLOCK_KINDS, KIND_INFO, asKind, isHeading, levelOf } from '../model/blocks';
import { IconFold, IconHighlight, IconRedo, IconUndo, IconUnfold, } from './icons';
export function DocEditor({ ydoc, provider, docId, onEditor }) {
    const editor = useEditor({
        extensions: [
            ...contentExtensions(),
            Collaboration.configure({ document: ydoc, field: BODY_FIELD }),
            RoundGuard.configure({ ydoc, docId }),
            ...(provider ? [CollaborationCaret.configure({ provider, user: provider.awareness.getLocalState()?.user ?? { name: 'Unnamed', color: '#888' } })] : []),
            Collapse,
            SpeechTags,
            Placeholder.configure({
                placeholder: ({ node }) => `${KIND_INFO[asKind(node.attrs.kind)].label}…`,
            }),
        ],
        editorProps: { attributes: { class: 'pp-doc', spellcheck: 'true' } },
    }, [ydoc, docId, provider]);
    useEffect(() => {
        onEditor(editor);
        return () => onEditor(null);
    }, [editor, onEditor]);
    return _jsx(EditorContent, { editor: editor, className: "pp-doc-scroll" });
}
export const MOD = isMac ? '⌘' : 'Ctrl';
const MARK_GLYPH = { extend: '→', dropped: '!', answered: '✓', key: '★' };
/** The speech a line will show under on the flow, and whether it was chosen by hand. */
function speechInfo(e) {
    const { $from } = e.state.selection;
    const node = $from.parent;
    const explicit = isSpeech(node.attrs.speech) ? node.attrs.speech : null;
    if ($from.depth < 1)
        return { explicit, effective: null, inSheet: false };
    const layout = computeFlow(readBlocks(e.state.doc));
    const pos = $from.before(1);
    return { explicit, effective: layout.speechAt.get(pos) ?? null, inSheet: !!sheetAt(layout, pos) };
}
export function Toolbar({ editor, view = 'doc', extra }) {
    useSettings(); // re-render when the style keys change
    const s = useEditorState({
        editor,
        selector: ({ editor: e }) => ({
            ...speechInfo(e),
            kind: asKind(e.state.selection.$from.parent.attrs.kind),
            mark: e.state.selection.$from.parent.attrs.mark ?? null,
            bold: e.isActive('bold'),
            italic: e.isActive('italic'),
            underline: e.isActive('underline'),
            strike: e.isActive('strike'),
            highlight: e.isActive('highlight'),
            canUndo: e.can().undo(),
            canRedo: e.can().redo(),
        }),
    });
    const btn = (active, label, title, run, content) => (_jsx("button", { type: "button", className: 'tb-btn' + (active ? ' is-on' : ''), title: title, "aria-label": title, "aria-pressed": active, onMouseDown: (e) => e.preventDefault(), onClick: run, children: content ?? label }));
    return (_jsxs("div", { className: "toolbar", role: "toolbar", children: [_jsxs("label", { className: "style-select", "data-kind": s.kind, children: [_jsx("span", { className: "sr-only", children: "Style" }), _jsx("select", { value: s.kind, onChange: (e) => editor.chain().focus().setBlockKind(e.target.value).run(), children: BLOCK_KINDS.map((k) => (_jsxs("option", { value: k, children: [KIND_INFO[k].label, "  (", styleKeyLabel(k), ")"] }, k))) })] }), s.kind !== 'position' && s.kind !== 'section' && (_jsxs("label", { className: "speech-select", title: "Which speech's column this line goes in on the flow", children: [_jsx("span", { className: "sr-only", children: "Speech" }), _jsxs("select", { value: s.explicit ?? '', disabled: !s.inSheet, onChange: (e) => editor.chain().focus().setBlockSpeech(e.target.value ? e.target.value : null).run(), children: [_jsx("option", { value: "", children: s.inSheet ? `Auto${s.effective && !s.explicit ? ` (${s.effective})` : ''}` : 'No sheet' }), SPEECHES.map((sp) => (_jsx("option", { value: sp, children: sp }, sp)))] })] })), _jsx("span", { className: "tb-sep" }), btn(s.bold, 'B', `Bold (${MOD}+B)`, () => editor.chain().focus().toggleBold().run(), _jsx("b", { children: "B" })), btn(s.italic, 'I', `Italic (${MOD}+I)`, () => editor.chain().focus().toggleItalic().run(), _jsx("i", { children: "I" })), btn(s.underline, 'U', `Underline (${MOD}+U)`, () => editor.chain().focus().toggleUnderline().run(), _jsx("u", { children: "U" })), btn(s.strike, 'S', 'Strikethrough', () => editor.chain().focus().toggleStrike().run(), _jsx("s", { children: "S" })), btn(s.highlight, 'H', `Highlight (${MOD}+Shift+H)`, () => editor.chain().focus().toggleHighlight().run(), _jsx(IconHighlight, {})), _jsx("span", { className: "tb-sep" }), _jsx("span", { className: "mark-btns", role: "group", "aria-label": "Flow marks", children: FLOW_MARKS.map((m) => btn(s.mark === m.mark, m.label, `${m.label}: ${m.hint} (${MOD}+Shift+${m.key})`, () => editor.chain().focus().toggleFlowMark(m.mark).run(), _jsx("span", { className: `mark-glyph mark-${m.mark}`, children: MARK_GLYPH[m.mark] }))) }), view === 'doc' && (_jsxs(_Fragment, { children: [_jsx("span", { className: "tb-sep" }), btn(false, '', 'Collapse to claims', () => editor.chain().collapseAll(3).run(), _jsx(IconFold, {})), btn(false, '', 'Expand all', () => editor.chain().expandAll().run(), _jsx(IconUnfold, {}))] })), view === 'flow' && (_jsxs(_Fragment, { children: [_jsx("span", { className: "tb-sep" }), _jsxs("span", { className: "tb-hint", children: ["Tab: next speech \u00B7 ", MOD, "+Enter: new row"] })] })), extra, _jsx("span", { className: "tb-spacer" }), _jsx("button", { type: "button", className: "tb-btn", title: `Undo (${MOD}+Z)`, "aria-label": "Undo", disabled: !s.canUndo, onMouseDown: (e) => e.preventDefault(), onClick: () => editor.chain().focus().undo().run(), children: _jsx(IconUndo, {}) }), _jsx("button", { type: "button", className: "tb-btn", title: `Redo (${MOD}+Shift+Z)`, "aria-label": "Redo", disabled: !s.canRedo, onMouseDown: (e) => e.preventDefault(), onClick: () => editor.chain().focus().redo().run(), children: _jsx(IconRedo, {}) })] }));
}
export function outlineItems(editor) {
    const items = [];
    editor.state.doc.forEach((node, pos) => {
        if (node.type.name === 'block' && isHeading(node.attrs.kind) && node.attrs.id) {
            items.push({ id: node.attrs.id, kind: asKind(node.attrs.kind), text: node.textContent, pos });
        }
    });
    return items;
}
export function Outline({ editor }) {
    const data = useEditorState({
        editor,
        selector: ({ editor: e }) => {
            const items = outlineItems(e);
            const at = e.state.selection.from;
            let current = null;
            for (const it of items)
                if (it.pos < at)
                    current = it.id;
            return { items, current };
        },
        equalityFn: (a, b) => JSON.stringify(a) === JSON.stringify(b),
    });
    const go = (it) => {
        const node = editor.state.doc.nodeAt(it.pos);
        if (!node)
            return;
        editor.chain().focus().setTextSelection(it.pos + 1 + node.content.size).run();
        const dom = editor.view.nodeDOM(it.pos);
        if (dom instanceof HTMLElement)
            dom.scrollIntoView({ block: 'center', behavior: 'smooth' });
    };
    return (_jsxs("nav", { className: "outline", "aria-label": "Outline", children: [_jsx("div", { className: "outline-title", children: "Outline" }), data.items.length === 0 && _jsx("p", { className: "outline-empty", children: "Headings (position titles, section titles, claims) show up here." }), _jsx("ul", { children: data.items.map((it) => (_jsx("li", { children: _jsx("button", { type: "button", className: 'outline-item' + (it.id === data.current ? ' is-current' : ''), "data-level": levelOf(it.kind), onClick: () => go(it), children: it.text || _jsx("em", { children: KIND_INFO[it.kind].label }) }) }, it.id))) })] }));
}
