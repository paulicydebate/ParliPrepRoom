import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCaret from '@tiptap/extension-collaboration-caret';
import { Placeholder } from '@tiptap/extensions';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { blockWithChildren } from '../model/outline';
import { useBoard } from '../store/pins';
import { useLibrary } from './useLibrary';
import { useDocs } from './hooks';
import { useRoundMode } from '../store/roundMode';
import { toast } from '../editor/roundGuard';
import { BODY_FIELD, contentExtensions } from '../editor/extensions';
import { RoundGuard } from '../editor/roundGuard';
import { activeSheet, flowKey, FlowView, sheetKey } from '../editor/flowView';
import { KIND_INFO, asKind } from '../model/blocks';
import { SPEECH_INFO } from '../model/speeches';
import { ColorwayPicker } from './ColorwayPicker';
import { IconClose, IconPin, IconPlus } from './icons';
export function FlowEditor({ ydoc, provider, docId, space, onEditor, }) {
    // The pins column lives inside the grid; React fills this element.
    const pinPanel = useMemo(() => document.createElement('div'), []);
    const editor = useEditor({
        extensions: [
            ...contentExtensions(),
            Collaboration.configure({ document: ydoc, field: BODY_FIELD }),
            RoundGuard.configure({ ydoc, docId }),
            ...(provider ? [CollaborationCaret.configure({ provider, user: provider.awareness.getLocalState()?.user ?? { name: 'Unnamed', color: '#888' } })] : []),
            FlowView.configure({ pinPanel }),
            Placeholder.configure({
                placeholder: ({ node }) => `${KIND_INFO[asKind(node.attrs.kind)].label}…`,
            }),
        ],
        editorProps: { attributes: { spellcheck: 'true' } },
    }, [ydoc, docId, provider]);
    useEffect(() => {
        onEditor(editor);
        return () => onEditor(null);
    }, [editor, onEditor]);
    return (_jsxs("div", { className: "flow-wrap", children: [editor && _jsx(SheetTabs, { editor: editor }), _jsxs("div", { className: "flow-scroll", children: [editor && _jsx(ColumnHeaders, { editor: editor }), _jsx(EditorContent, { editor: editor, className: "flow-grid-host" })] }), editor && createPortal(_jsx(PinColumn, { editor: editor, space: space }), pinPanel)] }));
}
function useSheets(editor) {
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
            };
        },
        equalityFn: (a, b) => JSON.stringify(a) === JSON.stringify(b),
    });
}
function SheetTabs({ editor }) {
    const { sheets, active } = useSheets(editor);
    const [renaming, setRenaming] = useState(null);
    return (_jsxs("div", { className: "sheet-tabs", role: "tablist", "aria-label": "Sheets", children: [sheets.map((s) => renaming === s.key ? (_jsx("input", { className: "sheet-rename", autoFocus: true, defaultValue: s.title, "aria-label": "Sheet name", onBlur: (e) => {
                    editor.commands.renameSheet(s.key, e.target.value.trim());
                    setRenaming(null);
                }, onKeyDown: (e) => {
                    if (e.key === 'Enter')
                        e.target.blur();
                    if (e.key === 'Escape')
                        setRenaming(null);
                } }, s.key)) : (_jsxs("button", { type: "button", role: "tab", "aria-selected": s.key === active, className: `sheet-tab fl-${s.side}` + (s.key === active ? ' is-on' : ''), title: "Double-click to rename", onClick: (e) => (e.detail >= 2 ? setRenaming(s.key) : editor.commands.showSheet(s.key)), children: [_jsx("span", { className: "sheet-dot" }), s.title || 'Untitled'] }, s.key))), active && (_jsxs("label", { className: "sheet-side", title: "Whose sheet this is", children: [_jsx("span", { className: "sr-only", children: "Side of this sheet" }), _jsxs("select", { value: sheets.find((s) => s.key === active)?.side ?? 'gov', onChange: (e) => editor.commands.setSheetSide(active, e.target.value), children: [_jsx("option", { value: "gov", children: "Gov sheet" }), _jsx("option", { value: "opp", children: "Opp sheet" })] })] })), _jsx(ColorsButton, {}), active && _jsx(DeleteSheetButton, { editor: editor, sheetKey: active, title: sheets.find((s) => s.key === active)?.title ?? '' }), _jsx("span", { className: "tb-spacer" }), _jsxs("button", { type: "button", className: "btn ghost small", onClick: () => editor.chain().addSheet('gov').focus().run(), children: [_jsx(IconPlus, {}), " Gov"] }), _jsxs("button", { type: "button", className: "btn ghost small", onClick: () => editor.chain().addSheet('opp').focus().run(), children: [_jsx(IconPlus, {}), " Opp"] })] }));
}
function ColumnHeaders({ editor }) {
    const { columns, sheets, pinCol } = useSheets(editor);
    if (!sheets.length) {
        return (_jsxs("div", { className: "flow-empty", children: [_jsx("p", { children: "No sheets yet. Every Position title in the doc becomes a sheet." }), _jsxs("p", { children: ["Add one with ", _jsx("strong", { children: "+ Gov" }), " or ", _jsx("strong", { children: "+ Opp" }), " above, or type a Position title in the doc view."] })] }));
    }
    return (_jsx("div", { className: "flow-head", style: { ['--fl-cols']: columns.length + (pinCol ? 1 : 0) }, children: columns.map((c, i) => (_jsxs(Fragment, { children: [_jsxs("div", { className: `flow-col-head fl-${SPEECH_INFO[c].side}`, title: SPEECH_INFO[c].name, children: [_jsx("span", { children: c }), _jsx("button", { type: "button", className: 'col-pin-btn' + (pinCol === i + 1 ? ' is-on' : ''), "aria-pressed": pinCol === i + 1, title: pinCol === i + 1 ? 'Hide pins' : `Show your pins for this sheet next to the ${c}`, onMouseDown: (e) => e.preventDefault(), onClick: () => editor.commands.togglePinColumn(i + 1), children: _jsx(IconPin, {}) })] }), pinCol === i + 1 && _jsx("div", { className: "flow-col-head pins-head", children: "Pins" })] }, c))) }));
}
/** Delete the sheet in view. Asks once more if the sheet has anything on it. */
function DeleteSheetButton({ editor, sheetKey: key, title }) {
    const [confirm, setConfirm] = useState(false);
    useEffect(() => setConfirm(false), [key]);
    useEffect(() => {
        if (!confirm)
            return;
        const t = setTimeout(() => setConfirm(false), 4000);
        return () => clearTimeout(t);
    }, [confirm]);
    const isEmpty = () => {
        const sheet = flowKey.getState(editor.state)?.layout.sheets.find((s) => sheetKey(s) === key);
        return !sheet || sheet.placements.every((p) => !editor.state.doc.nodeAt(p.pos)?.textContent.trim());
    };
    return (_jsx("button", { type: "button", className: 'btn ghost small sheet-delete' + (confirm ? ' confirm' : ''), title: "Delete this sheet and everything on it (Undo brings it back)", onClick: () => {
            if (!confirm && !isEmpty()) {
                setConfirm(true);
                return;
            }
            setConfirm(false);
            editor.chain().focus().deleteSheet(key).run();
            toast(`Deleted “${title || 'Untitled'}”. Press ${navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+Z to undo.`);
        }, children: confirm ? `Delete “${title || 'Untitled'}” and everything on it?` : 'Delete sheet' }));
}
/** Pins for the sheet in view, shown as a column in the flow. Read-only; tap to open the block. */
function PinColumn({ editor, space }) {
    const { title, pinCol } = useSheets(editor);
    const board = useBoard(space);
    const roundMode = useRoundMode();
    const docs = useDocs();
    const lower = (x) => x.trim().toLowerCase();
    // In Round Mode, only pins from round docs (typed by hand during prep).
    const pins = board.pins.filter((p) => p.group && lower(p.group) === lower(title) && (!roundMode || docs?.find((d) => d.id === p.docId)?.round));
    const { index } = useLibrary([...new Set(pins.map((p) => p.docId))], pinCol !== null);
    if (pinCol === null)
        return null;
    return (_jsxs("div", { className: "fl-pins-inner", children: [pins.length === 0 && (_jsxs("p", { className: "muted small", children: ["No pins for \u201C", title || 'this sheet', "\u201D yet. Pin blocks in your prep doc, then choose \u201C", title || 'this sheet', "\u201D as their sheet in the pin panel."] })), pins.map((p, i) => {
                const entries = index.get(p.docId);
                const blocks = entries ? blockWithChildren(entries, p.blockId) : [];
                return (_jsxs("button", { type: "button", className: "fl-pin", title: "Open this block in your prep", onClick: () => window.dispatchEvent(new CustomEvent('pp-jump', { detail: { docId: p.docId, blockId: p.blockId } })), children: [_jsx("span", { className: "pin-num", children: i + 1 }), _jsxs("span", { className: "fl-pin-body", children: [!entries && _jsx("span", { className: "muted small", children: "Loading\u2026" }), entries && blocks.length === 0 && _jsx("span", { className: "muted small", children: "This block was deleted." }), blocks.map((b) => (_jsx("span", { className: "pp-block", "data-kind": b.kind, children: b.text || '\u00a0' }, b.id)))] })] }, `${p.docId}:${p.blockId}`));
            })] }));
}
/** "Colors" in the sheet bar: a quick window to switch Gov/Opp colors. */
function ColorsButton() {
    const [open, setOpen] = useState(false);
    return (_jsxs(_Fragment, { children: [_jsxs("button", { type: "button", className: "btn ghost small colors-btn", title: "Change Gov and Opp colors", onClick: () => setOpen(true), children: [_jsxs("span", { className: "mini-swatch", "aria-hidden": "true", children: [_jsx("span", { style: { background: 'var(--gov)' } }), _jsx("span", { style: { background: 'var(--opp)' } })] }), "Colors"] }), open && createPortal(_jsx(ColorsDialog, { onClose: () => setOpen(false) }), document.body)] }));
}
function ColorsDialog({ onClose }) {
    const ref = useRef(null);
    useEffect(() => {
        const d = ref.current;
        if (d && !d.open)
            d.showModal();
    }, []);
    return (_jsxs("dialog", { ref: ref, className: "settings colors-dialog", onClose: onClose, onCancel: onClose, onClick: (e) => {
            if (e.target === e.currentTarget)
                onClose();
        }, children: [_jsxs("div", { className: "settings-head", children: [_jsx("h2", { children: "Gov & Opp colors" }), _jsx("button", { type: "button", className: "icon-btn", "aria-label": "Close", onClick: onClose, children: _jsx(IconClose, {}) })] }), _jsx("p", { className: "muted", children: "Saved in this browser. Your partner can pick different colors for the same flow." }), _jsx(ColorwayPicker, {}), _jsxs("div", { className: "settings-foot", children: [_jsx("span", {}), _jsx("button", { type: "button", className: "btn primary", onClick: onClose, children: "Done" })] })] }));
}
