import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEditorState } from '@tiptap/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { KIND_INFO, asKind, isHeading } from '../model/blocks';
import { blockWithChildren, searchEntries } from '../model/outline';
import { useRoundMode } from '../store/roundMode';
import { clearPins, followSheet, isPinned, movePin, selectGroup, setFollowFlow, setPinGroup, togglePin, useBoard, usePins, visiblePins } from '../store/pins';
import { activeSheet, flowKey } from '../editor/flowView';
import { IconClose, IconPin } from './icons';
/** Ctrl/Cmd+K: search the prep and jump to (or pin) a block. Nothing is copied. */
export function BlockFinder({ docs, index, space, roundMode, onJump, onInsert, insertBlocked, onClose, }) {
    const ref = useRef(null);
    const [query, setQuery] = useState('');
    const [sel, setSel] = useState(0);
    usePins(space); // re-render when pins change
    useEffect(() => {
        const d = ref.current;
        if (d && !d.open)
            d.showModal();
    }, []);
    const results = useMemo(() => {
        const all = [];
        for (const doc of docs) {
            const entries = index.get(doc.id);
            if (!entries)
                continue;
            for (const h of searchEntries(entries, query))
                all.push({ ...h, doc });
        }
        // One row per jump target, best match first.
        const seen = new Set();
        return all
            .sort((a, b) => b.score - a.score)
            .filter((h) => {
            const k = `${h.doc.id}:${h.target.id}`;
            if (seen.has(k))
                return false;
            seen.add(k);
            return true;
        })
            .slice(0, 40);
    }, [docs, index, query]);
    useEffect(() => setSel(0), [query]);
    const jump = (h) => {
        onJump(h.doc.id, h.target.id);
        onClose();
    };
    return (_jsxs("dialog", { ref: ref, className: "settings finder", onClose: onClose, onCancel: onClose, children: [_jsx("input", { className: "finder-input", autoFocus: true, value: query, placeholder: roundMode ? 'Search your round docs… (e.g. "perm" or "solvency deficit")' : 'Search your docs…', "aria-label": "Search blocks", onChange: (e) => setQuery(e.target.value), onKeyDown: (e) => {
                    if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setSel((s) => Math.min(results.length - 1, s + 1));
                    }
                    else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setSel((s) => Math.max(0, s - 1));
                    }
                    else if (e.key === 'Enter' && results[sel]) {
                        e.preventDefault();
                        if (e.altKey || e.metaKey || e.ctrlKey)
                            togglePin(space, { docId: results[sel].doc.id, blockId: results[sel].target.id });
                        else
                            jump(results[sel]);
                    }
                } }), _jsxs("p", { className: "finder-hint muted small", children: ["\u2191 \u2193 to choose \u00B7 Enter to jump \u00B7 Ctrl+Enter (\u2318\u21A9 on Mac) to pin \u00B7 Esc to close", roundMode ? ' · searching round docs only' : ''] }), _jsxs("ul", { className: "finder-results", role: "listbox", "aria-label": "Results", children: [query && results.length === 0 && _jsxs("li", { className: "muted finder-empty", children: ["No matches", index.size < docs.length ? ' yet (still loading docs)' : '', "."] }), results.map((h, i) => {
                        const pinned = isPinned(space, { docId: h.doc.id, blockId: h.target.id });
                        return (_jsxs("li", { role: "option", "aria-selected": i === sel, className: i === sel ? 'is-sel' : '', onMouseEnter: () => setSel(i), children: [_jsxs("button", { type: "button", className: "finder-hit", onClick: () => jump(h), children: [_jsx("span", { className: "finder-kind", "data-kind": h.target.kind, children: KIND_INFO[h.target.kind].label }), _jsx("span", { className: "finder-text", children: h.target.text || '(empty)' }), h.entry !== h.target && _jsxs("span", { className: "finder-match", children: ["\u2026", h.entry.text.slice(0, 120)] }), _jsx("span", { className: "finder-path muted small", children: [h.doc.title, ...h.target.path].join(' › ') })] }), !roundMode && (_jsx("button", { type: "button", className: 'btn ghost small' + (insertBlocked ? ' is-blocked' : ''), title: insertBlocked ?? 'Insert a copy below the caret in the doc you were in', onClick: () => {
                                        onInsert(h.doc.id, h.target.id);
                                        if (!insertBlocked)
                                            onClose();
                                    }, children: "Insert" })), _jsx("button", { type: "button", className: 'btn ghost small finder-pin' + (pinned ? ' is-on' : ''), "aria-pressed": pinned, onClick: () => togglePin(space, { docId: h.doc.id, blockId: h.target.id }), children: pinned ? 'Pinned' : 'Pin' })] }, `${h.doc.id}:${h.target.id}`));
                    })] })] }));
}
/** The blocks a speaker plans to read, in order, in groups that can follow the flow. Read-only; tap to jump. */
export function PinBoard({ space, docs, index, followEditor, allEditors, onJump, onInsert, insertBlocked, onClose, }) {
    const roundMode = useRoundMode();
    const board = useBoard(space);
    const pins = visiblePins(board);
    const sheets = useFlowSheets(allEditors);
    const lower = (x) => x.trim().toLowerCase();
    // Tabs: sheets that have pins, plus any other sheet names pins were given.
    const used = board.pins.map((p) => p.group).filter((g) => !!g);
    const groups = [];
    for (const g of [...sheets, ...used])
        if (used.some((u) => lower(u) === lower(g)) && !groups.some((x) => lower(x) === lower(g)))
            groups.push(g);
    // Choices for a pin's sheet: the flow's sheets, then names already used.
    const choices = [];
    for (const g of [...sheets, ...used])
        if (!choices.some((x) => lower(x) === lower(g)))
            choices.push(g);
    const count = (g) => board.pins.filter((p) => p.group?.toLowerCase() === g.toLowerCase()).length;
    // Follow the flow: switching to sheet "T" shows the "T" group.
    useEffect(() => {
        if (!followEditor)
            return;
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
    return (_jsxs("aside", { className: "pinboard", "aria-label": "Pinned blocks", children: [_jsxs("div", { className: "pinboard-head", children: [_jsx("strong", { children: "Pinned blocks" }), _jsx("span", { className: "tb-spacer" }), pins.length > 0 && (_jsx("button", { type: "button", className: "btn ghost small", onClick: () => clearPins(space), title: board.selected ? `Unpin everything in ${board.selected}` : 'Unpin everything', children: "Clear" })), _jsx("button", { type: "button", className: "icon-btn small", "aria-label": "Close pinned blocks", onClick: onClose, children: _jsx(IconClose, {}) })] }), _jsxs("div", { className: "pin-tabs", role: "tablist", "aria-label": "Pin groups", children: [_jsxs("button", { type: "button", role: "tab", "aria-selected": !board.selected, className: !board.selected ? 'is-on' : '', onClick: () => selectGroup(space, ''), children: ["All ", _jsx("span", { className: "pin-count", children: board.pins.length })] }), groups.map((g) => (_jsxs("button", { type: "button", role: "tab", "aria-selected": board.selected.toLowerCase() === g.toLowerCase(), className: board.selected.toLowerCase() === g.toLowerCase() ? 'is-on' : '', onClick: () => selectGroup(space, g), children: [g, " ", _jsx("span", { className: "pin-count", children: count(g) })] }, g)))] }), _jsx("div", { className: "pin-options", children: _jsxs("label", { className: "check", children: [_jsx("input", { type: "checkbox", checked: board.followFlow, onChange: (e) => setFollowFlow(space, e.target.checked) }), " Follow flow sheets"] }) }), board.selected && _jsxs("p", { className: "muted small pin-note", children: ["Showing pins for the \u201C", board.selected, "\u201D sheet. New pins go here too."] }), sheets.length === 0 && board.pins.length > 0 && (_jsx("p", { className: "muted small pin-note", children: "Open your flow (Flow view) to choose which sheet each pin answers." })), pins.length === 0 && (_jsx("p", { className: "muted small pin-empty", children: board.selected
                    ? `Nothing pinned for “${board.selected}” yet.`
                    : "Pin the blocks you might read: put the cursor in a section title, claim or analytic and press Pin in the toolbar (or pin from search, Ctrl+K / ⌘K). Then pick which flow sheet each pin answers, and the list follows the sheet you're on." })), _jsx("ol", { className: "pin-list", children: pins.map((p, i) => {
                    const doc = docs.find((d) => d.id === p.docId);
                    const entries = index.get(p.docId);
                    const blocks = entries ? blockWithChildren(entries, p.blockId) : [];
                    return (_jsxs("li", { className: "pin", children: [_jsxs("div", { className: "pin-top", children: [_jsxs("button", { type: "button", className: "pin-title", onClick: () => onJump(p.docId, p.blockId), title: "Jump to this block", children: [_jsx("span", { className: "pin-num", children: i + 1 }), _jsx("span", { className: "muted small", children: doc ? [doc.title, ...(blocks[0]?.path ?? [])].join(' › ') : 'Doc not available' })] }), _jsx("button", { type: "button", className: "icon-btn small", "aria-label": "Move up", disabled: i === 0, onClick: () => movePin(space, p, -1), children: "\u2191" }), _jsx("button", { type: "button", className: "icon-btn small", "aria-label": "Move down", disabled: i === pins.length - 1, onClick: () => movePin(space, p, 1), children: "\u2193" }), _jsx("button", { type: "button", className: "icon-btn small", "aria-label": "Unpin", onClick: () => togglePin(space, p), children: _jsx(IconClose, {}) })] }), _jsxs("div", { className: "pin-body pp-doc", onClick: () => onJump(p.docId, p.blockId), children: [!entries && _jsx("p", { className: "muted small", children: "Loading\u2026" }), entries && blocks.length === 0 && _jsx("p", { className: "muted small", children: "This block was deleted." }), blocks.map((b) => (_jsx("div", { className: "pp-block", "data-kind": b.kind, children: b.text || '\u00a0' }, b.id)))] }), _jsxs("div", { className: "pin-foot", children: [_jsxs("label", { className: "pin-group-select", children: [_jsx("span", { className: "sr-only", children: "Flow sheet this answers" }), _jsxs("select", { value: choices.find((c) => lower(c) === lower(p.group ?? '')) ?? '', onChange: (e) => setPinGroup(space, p, e.target.value || undefined), children: [_jsx("option", { value: "", children: choices.length ? 'Which sheet?' : 'No sheet (open your flow)' }), choices.map((g) => (_jsx("option", { value: g, children: sheets.some((x) => lower(x) === lower(g)) ? g : `${g} (not on flow)` }, g)))] })] }), !roundMode && (_jsx("button", { type: "button", className: 'btn ghost small pin-insert' + (insertBlocked ? ' is-blocked' : ''), title: insertBlocked ?? 'Insert a copy below the caret in the doc you were in', onMouseDown: (e) => e.preventDefault(), onClick: () => onInsert(p.docId, p.blockId), children: "Insert" }))] })] }, `${p.docId}:${p.blockId}`));
                }) })] }));
}
/** Toolbar button: pin the claim (or heading) the caret is in. */
export function PinButton({ editor, docId, space }) {
    usePins(space);
    // Pin at the level the caret is on: a section title pins the whole
    // section, a claim pins it with its warrants, an analytic pins just itself.
    // A warrant or note pins the claim (or heading) it sits under.
    const target = useEditorState({
        editor,
        selector: ({ editor: e }) => {
            const { $from } = e.state.selection;
            if ($from.depth < 1)
                return null;
            const here = $from.index(0);
            const own = e.state.doc.child(here);
            if (own.type.name === 'block' && own.attrs.id && (isHeading(own.attrs.kind) || own.attrs.kind === 'analytic')) {
                return { id: own.attrs.id, kind: asKind(own.attrs.kind) };
            }
            for (let i = here - 1; i >= 0; i--) {
                const n = e.state.doc.child(i);
                if (n.type.name === 'block' && isHeading(n.attrs.kind) && n.attrs.id)
                    return { id: n.attrs.id, kind: asKind(n.attrs.kind) };
            }
            return null;
        },
        equalityFn: (a, b) => a?.id === b?.id && a?.kind === b?.kind,
    });
    if (!target)
        return null;
    const pinned = isPinned(space, { docId, blockId: target.id });
    const what = target.kind === 'position' ? 'position' : target.kind === 'section' ? 'section' : target.kind === 'analytic' ? 'analytic' : 'claim';
    return (_jsxs("button", { type: "button", className: 'tb-btn pin-btn' + (pinned ? ' is-on' : ''), title: pinned ? `Unpin this ${what}` : `Pin this ${what}${what === 'section' ? ' (everything up to the next section)' : what === 'claim' ? ' with its warrants' : ''}`, "aria-pressed": pinned, onMouseDown: (e) => e.preventDefault(), onClick: () => togglePin(space, { docId, blockId: target.id }), children: [_jsx(IconPin, {}), " ", pinned ? `Pinned ${what}` : `Pin ${what}`] }));
}
/** Sheet names from every open flow (live as sheets are added or renamed). */
function useFlowSheets(editors) {
    const [names, setNames] = useState([]);
    useEffect(() => {
        const compute = () => {
            const out = [];
            for (const ed of editors) {
                const st = flowKey.getState(ed.state);
                if (!st)
                    continue;
                for (const sh of st.layout.sheets)
                    if (sh.title.trim() && !out.includes(sh.title.trim()))
                        out.push(sh.title.trim());
            }
            setNames((prev) => (prev.join('\u0000') === out.join('\u0000') ? prev : out));
        };
        compute();
        for (const ed of editors)
            ed.on('transaction', compute);
        return () => {
            for (const ed of editors)
                ed.off('transaction', compute);
        };
    }, [editors]);
    return names;
}
