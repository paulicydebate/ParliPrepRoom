import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from '../editor/roundGuard';
import { renameDoc, setDocRound } from '../store/docs';
import { setRound, useRound } from '../store/roundDoc';
import { useSyncStatus } from '../store/sync';
import { DocEditor, Outline, Toolbar } from './DocEditor';
import { FlowEditor } from './FlowEditor';
import { CheckLinkButton, PartnersButton } from './RoundTools';
import { PinButton } from './RoundModeUI';
import { HistoryView } from './HistoryView';
import { IconClose, IconDownload, IconHistory, IconLock, IconMore, IconOutline, IconShare, IconSwap } from './icons';
import { useYDoc } from './useYDoc';
/** Download the doc as Word, or its flow as Excel. */
async function exportDoc(editor, title, kind) {
    if (!editor)
        return;
    const { download, safeFilename } = await import('../export/runs');
    const name = safeFilename(title);
    if (kind === 'docx') {
        const { buildDocx } = await import('../export/docx');
        download(await buildDocx(editor.state.doc, title), `${name}.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    }
    else {
        const { buildFlowXlsx } = await import('../export/xlsx');
        download(new Uint8Array(buildFlowXlsx(editor.state.doc)), `${name} flow.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    }
}
async function copyShareLink(docId) {
    const link = `${location.origin}/#doc=${encodeURIComponent(docId)}`;
    try {
        await navigator.clipboard.writeText(link);
        toast('Link copied. Teammates who can see this doc can open it with the link.');
    }
    catch {
        window.prompt('Copy this link', link);
    }
}
const closeMenu = (e) => {
    const d = e.currentTarget.closest('details');
    if (d)
        d.open = false;
};
function ExportMenu({ editor, title }) {
    const [busy, setBusy] = useState(false);
    const run = async (e, kind) => {
        closeMenu(e);
        setBusy(true);
        try {
            await exportDoc(editor, title, kind);
        }
        finally {
            setBusy(false);
        }
    };
    return (_jsxs("details", { className: "export-menu", children: [_jsx("summary", { className: "icon-btn", title: "Export", "aria-label": "Export", children: _jsx(IconDownload, {}) }), _jsxs("div", { className: "menu", children: [_jsx("button", { type: "button", disabled: busy, onClick: (e) => void run(e, 'docx'), children: "Word document (.docx)" }), _jsx("button", { type: "button", disabled: busy, onClick: (e) => void run(e, 'xlsx'), children: "Excel flow (.xlsx)" })] })] }));
}
/** Pick which doc this window shows. */
function DocSwitcher({ docs, value, onPick }) {
    return (_jsxs("label", { className: "icon-btn select-overlay doc-switch", title: "Show a different document", children: [_jsx(IconSwap, {}), _jsxs("select", { value: value ?? '', "aria-label": "Show a different document", onChange: (e) => onPick(e.target.value || null), children: [_jsx("option", { value: "", children: "Choose a document\u2026" }), _jsx("optgroup", { label: "Prep", children: docs.filter((d) => d.kind === 'prep').map((d) => (_jsx("option", { value: d.id, children: d.title }, d.id))) }), _jsx("optgroup", { label: "Reference", children: docs.filter((d) => d.kind === 'reference').map((d) => (_jsx("option", { value: d.id, children: d.title }, d.id))) })] })] }));
}
/** Top-right switch that makes a doc a round doc (paste off, typing logged). */
function RoundToggle({ ydoc, docId, round }) {
    const [confirmOff, setConfirmOff] = useState(false);
    useEffect(() => {
        if (!confirmOff)
            return;
        const t = setTimeout(() => setConfirmOff(false), 4000);
        return () => clearTimeout(t);
    }, [confirmOff]);
    if (!round) {
        return (_jsxs("button", { type: "button", className: "round-toggle", title: "Make this a round doc: paste and drag-and-drop are blocked and typing is logged", "aria-pressed": false, onClick: () => {
                setRound(ydoc, docId, true);
                toast('Round doc on: paste is off and typing is logged.');
            }, children: [_jsx("span", { className: "switch" }), " ", _jsx(IconLock, {}), " ", _jsx("span", { className: "round-toggle-label", children: "Round doc" })] }));
    }
    return (_jsxs("button", { type: "button", className: 'round-toggle is-on' + (confirmOff ? ' confirm' : ''), "aria-pressed": true, title: "Round doc: paste is off and typing is logged", onClick: () => {
            if (!confirmOff) {
                setConfirmOff(true);
                return;
            }
            setConfirmOff(false);
            setRound(ydoc, docId, false);
            toast('Round doc off. This is recorded in the typing log.');
        }, children: [_jsx("span", { className: "switch" }), " ", _jsx(IconLock, {}), " ", _jsx("span", { className: confirmOff ? '' : 'round-toggle-label', children: confirmOff ? 'Turn off? (logged)' : 'Round doc' })] }));
}
function SyncDot({ status }) {
    const label = status === 'synced' ? 'Saved to the server' : status === 'connecting' ? 'Connecting…' : 'Offline: saved on this device, syncs when back online';
    return _jsx("span", { className: `sync-dot ${status}`, title: label, "aria-label": label, role: "img" });
}
function ShareButton({ docId }) {
    return (_jsx("button", { type: "button", className: "icon-btn", title: "Copy a link to this doc for a teammate", "aria-label": "Share", onClick: () => void copyShareLink(docId), children: _jsx(IconShare, {}) }));
}
function TitleInput({ meta, ydoc, provider }) {
    const [value, setValue] = useState(meta.title);
    useEffect(() => setValue(meta.title), [meta.title]);
    // The title also lives inside the doc, so a partner who opens a shared
    // link sees the same name. When the doc first opens, the doc's copy wins
    // (a partner may have renamed it); after that, a rename made anywhere on
    // this device (sidebar or title box) is written into the doc.
    const seeded = useRef(null);
    useEffect(() => {
        if (!ydoc)
            return;
        const map = ydoc.getMap('settings');
        const pull = (e) => {
            if (e?.transaction.local)
                return;
            const t = map.get('title');
            if (typeof t === 'string' && t && t !== meta.title)
                void renameDoc(meta.id, t);
        };
        let seed = null;
        if (seeded.current === ydoc) {
            if (map.get('title') !== meta.title)
                map.set('title', meta.title);
        }
        else {
            // Only fill in a missing title once we've heard from the server, so a
            // newly joined device doesn't overwrite the real one with a placeholder.
            seed = () => {
                seeded.current = ydoc;
                if (typeof map.get('title') !== 'string')
                    map.set('title', meta.title);
                else
                    pull();
            };
            if (!provider || provider.synced)
                seed();
            else
                provider.once('sync', seed);
        }
        map.observe(pull);
        return () => {
            map.unobserve(pull);
            if (seed)
                provider?.off('sync', seed);
        };
    }, [ydoc, provider, meta.id, meta.title]);
    const commit = () => {
        const t = value.trim();
        if (t && t !== meta.title) {
            void renameDoc(meta.id, t);
            ydoc?.getMap('settings').set('title', t);
        }
        else
            setValue(meta.title);
    };
    return (_jsx("input", { className: "title-input", value: value, "aria-label": "Document title", onChange: (e) => setValue(e.target.value), onBlur: commit, onKeyDown: (e) => {
            if (e.key === 'Enter')
                e.target.blur();
            if (e.key === 'Escape') {
                setValue(meta.title);
                e.target.blur();
            }
        } }));
}
export function Pane({ pane, docs, focused, canClose, alsoOpen = false, space, roundMode = false, onEditorChange, onFocus, onChange, onClose, onCreate, }) {
    const meta = docs.find((d) => d.id === pane.docId) ?? null;
    const opened = useYDoc(meta && !(roundMode && !meta.round) ? meta.id : null);
    const ydoc = opened?.doc ?? null;
    const provider = opened?.provider ?? null;
    const syncStatus = useSyncStatus(provider);
    const [editor, setEditor] = useState(null);
    const [history, setHistory] = useState(false);
    const reportRef = useRef(onEditorChange);
    reportRef.current = onEditorChange;
    const onEditor = useCallback((e) => {
        setEditor(e);
        reportRef.current?.(e);
    }, []);
    useEffect(() => setHistory(false), [pane.docId]);
    const view = pane.view ?? 'doc';
    const round = useRound(ydoc);
    // Jump to a block (from search or the pin board) once the editor is ready.
    useEffect(() => {
        if (!editor || !pane.focus)
            return;
        const { blockId } = pane.focus;
        let pos = -1;
        editor.state.doc.forEach((n, p) => {
            if (pos < 0 && n.attrs.id === blockId)
                pos = p;
        });
        if (pos < 0)
            return;
        const node = editor.state.doc.nodeAt(pos);
        editor.chain().focus().setTextSelection(pos + 1 + node.content.size).run();
        const dom = editor.view.nodeDOM(pos);
        if (dom instanceof HTMLElement) {
            dom.scrollIntoView({ block: 'center', behavior: 'smooth' });
            dom.classList.add('pp-flash');
            setTimeout(() => dom.classList.remove('pp-flash'), 1600);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editor, pane.focus?.n]);
    // Keep the sidebar's round-doc dot right when a partner flips the switch.
    useEffect(() => {
        if (meta && ydoc && !!meta.round !== round)
            void setDocRound(meta.id, round);
    }, [meta, ydoc, round]);
    return (_jsxs("section", { className: 'pane' + (focused ? ' is-focused' : '') + (round ? ' is-round' : ''), onPointerDownCapture: onFocus, onFocusCapture: onFocus, "aria-label": meta ? meta.title : 'Empty pane', children: [_jsxs("header", { className: "pane-head", children: [meta ? (_jsxs(_Fragment, { children: [round ? (_jsxs("span", { className: "badge round", title: "Round doc: paste is off and typing is logged", children: [_jsx(IconLock, {}), " Round doc"] })) : (_jsx("span", { className: 'badge ' + meta.kind, children: meta.kind === 'prep' ? 'Prep' : 'Reference' })), _jsx(TitleInput, { meta: meta, ydoc: ydoc, provider: provider }), syncStatus !== 'off' && _jsx(SyncDot, { status: syncStatus }), alsoOpen && (_jsx("span", { className: "linked-chip", title: "This document is open in another pane too. Both panes show the same text; editing one edits the other.", children: "Same doc as other pane" }))] })) : (_jsx("span", { className: "pane-empty-title", children: "Open a document" })), _jsx("span", { className: "tb-spacer" }), meta && (_jsxs("div", { className: "seg view-toggle", role: "group", "aria-label": "View", children: [_jsx("button", { type: "button", className: view === 'doc' ? 'is-on' : '', "aria-pressed": view === 'doc', onClick: () => onChange({ ...pane, view: 'doc' }), children: "Doc" }), _jsx("button", { type: "button", className: view === 'flow' ? 'is-on' : '', "aria-pressed": view === 'flow', onClick: () => onChange({ ...pane, view: 'flow' }), children: "Flow" })] })), _jsx(DocSwitcher, { docs: docs, value: pane.docId, onPick: (docId) => onChange({ ...pane, docId }) }), meta && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "pane-tools", children: [view === 'doc' && (_jsx("button", { type: "button", className: 'icon-btn' + (pane.outline ? ' is-on' : ''), title: "Outline", "aria-label": "Outline", "aria-pressed": pane.outline, onClick: () => onChange({ ...pane, outline: !pane.outline }), children: _jsx(IconOutline, {}) })), provider && _jsx(ShareButton, { docId: meta.id }), _jsx(ExportMenu, { editor: editor, title: meta.title }), _jsx("button", { type: "button", className: 'icon-btn' + (history ? ' is-on' : ''), title: "Version history", "aria-label": "Version history", "aria-pressed": history, onClick: () => setHistory((h) => !h), children: _jsx(IconHistory, {}) })] }), _jsxs("details", { className: "pane-more", children: [_jsx("summary", { className: "icon-btn", "aria-label": "More", title: "More", children: _jsx(IconMore, {}) }), _jsxs("div", { className: "menu", children: [_jsxs("label", { className: "menu-select", children: [_jsx("span", { children: "Show a different doc" }), _jsx("select", { value: pane.docId ?? '', onChange: (e) => {
                                                            const d = e.currentTarget.closest('details');
                                                            if (d)
                                                                d.open = false;
                                                            onChange({ ...pane, docId: e.target.value || null });
                                                        }, children: docs.map((d) => (_jsx("option", { value: d.id, children: d.title }, d.id))) })] }), view === 'doc' && (_jsx("button", { type: "button", onClick: (e) => (closeMenu(e), onChange({ ...pane, outline: !pane.outline })), children: pane.outline ? 'Hide outline' : 'Show outline' })), _jsx("button", { type: "button", onClick: (e) => (closeMenu(e), setHistory((h) => !h)), children: history ? 'Close history' : 'Version history' }), provider && (_jsx("button", { type: "button", onClick: (e) => (closeMenu(e), void copyShareLink(meta.id)), children: "Copy link to this doc" })), _jsx("button", { type: "button", onClick: (e) => (closeMenu(e), void exportDoc(editor, meta.title, 'docx')), children: "Download Word (.docx)" }), _jsx("button", { type: "button", onClick: (e) => (closeMenu(e), void exportDoc(editor, meta.title, 'xlsx')), children: "Download Excel flow (.xlsx)" })] })] })] })), meta && ydoc && _jsx(RoundToggle, { ydoc: ydoc, docId: meta.id, round: round }), canClose && (_jsx("button", { type: "button", className: "icon-btn", title: "Close pane", "aria-label": "Close pane", onClick: onClose, children: _jsx(IconClose, {}) }))] }), meta && round && (_jsxs("div", { className: "round-strip", children: [_jsxs("span", { children: [_jsx(IconLock, {}), " ", meta.roundLabel ? `${meta.roundLabel}${meta.tournamentName ? ` · ${meta.tournamentName}` : ''} · ` : '', "Round doc \u00B7 paste is off \u00B7 typing is recorded"] }), _jsx("span", { className: "tb-spacer" }), provider && _jsx(PartnersButton, { meta: meta }), provider && _jsx(CheckLinkButton, { meta: meta })] })), !meta && (_jsxs("div", { className: "pane-picker", children: [_jsx("p", { children: "Pick a document for this pane." }), _jsx("div", { className: "picker-cols", children: ['prep', 'reference'].map((kind) => (_jsxs("div", { children: [_jsx("h3", { children: kind === 'prep' ? 'Prep' : 'Reference' }), _jsx("ul", { children: docs
                                        .filter((d) => d.kind === kind)
                                        .map((d) => (_jsx("li", { children: _jsx("button", { type: "button", onClick: () => onChange({ ...pane, docId: d.id }), children: d.title }) }, d.id))) }), _jsxs("button", { type: "button", className: "btn ghost small", onClick: () => onCreate(kind), children: ["+ New ", kind === 'prep' ? 'prep doc' : 'reference doc'] })] }, kind))) })] })), meta && !ydoc && !(roundMode && !meta.round) && _jsx("div", { className: "pane-loading", children: "Opening\u2026" }), meta && roundMode && !meta.round && (_jsxs("div", { className: "pane-blocked", children: [_jsx(IconLock, {}), _jsxs("p", { children: [_jsx("strong", { children: "Round Mode is on." }), " Only round docs (typed by hand during prep) can be open during the round."] }), _jsx("button", { type: "button", className: "btn", onClick: () => onChange({ ...pane, docId: null }), children: "Pick a round doc" })] })), meta && ydoc && !(roundMode && !meta.round) && (_jsxs(_Fragment, { children: [!history && editor && _jsx(Toolbar, { editor: editor, view: view, extra: _jsx(PinButton, { editor: editor, docId: meta.id, space: space }) }), _jsxs("div", { className: "pane-body", hidden: history, children: [view === 'doc' && pane.outline && editor && _jsx(Outline, { editor: editor }), view === 'doc' ? _jsx(DocEditor, { ydoc: ydoc, provider: provider, docId: meta.id, onEditor: onEditor }, "doc") : _jsx(FlowEditor, { ydoc: ydoc, provider: provider, docId: meta.id, space: space, onEditor: onEditor }, "flow")] }), history && _jsx(HistoryView, { docId: meta.id, ydoc: ydoc, editor: editor, round: round, checkToken: meta.checkToken, server: !!provider, onClose: () => setHistory(false) })] }))] }));
}
