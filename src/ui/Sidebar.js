import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useRef, useState } from 'react';
import { useAccount } from '../store/account';
import { moveDoc, renameDoc, setDocTeam, sortDocs } from '../store/docs';
import { IconBook, IconDoc, IconGrip, IconPlus, IconUpload } from './icons';
const coarsePointer = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
function DocRow({ doc, openHere, onOpen, onDelete, drag, }) {
    const [editing, setEditing] = useState(false);
    const [value, setValue] = useState(doc.title);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const { teams } = useAccount();
    if (editing) {
        return (_jsx("li", { children: _jsx("input", { className: "doc-rename", autoFocus: true, value: value, "aria-label": "Rename document", onChange: (e) => setValue(e.target.value), onBlur: () => {
                    if (value.trim())
                        void renameDoc(doc.id, value.trim());
                    setEditing(false);
                }, onKeyDown: (e) => {
                    if (e.key === 'Enter')
                        e.target.blur();
                    if (e.key === 'Escape') {
                        setValue(doc.title);
                        setEditing(false);
                    }
                } }) }));
    }
    return (_jsxs("li", { className: 'doc-row' + (openHere ? ' is-open' : '') + (drag.dropBefore ? ' drop-before' : '') + (drag.dragging ? ' is-dragging' : ''), "data-doc-id": doc.id, "data-kind": doc.kind, draggable: !coarsePointer, onDragStart: drag.onDragStart, onDragOver: drag.onDragOver, onDrop: drag.onDrop, onDragEnd: drag.onDragEnd, children: [_jsxs("button", { type: "button", className: "doc-link", onClick: (e) => (e.detail >= 2 ? setEditing(true) : onOpen()), title: "Click to open, double-click to rename, drag to reorder", children: [doc.kind === 'prep' ? _jsx(IconDoc, {}) : _jsx(IconBook, {}), _jsx("span", { children: doc.title }), doc.round && _jsx("span", { className: "round-dot", title: "Round doc" })] }), _jsx("span", { className: "drag-handle", "aria-hidden": "true", title: "Drag to reorder", onPointerDown: drag.onHandleDown, children: _jsx(IconGrip, {}) }), _jsxs("details", { className: "doc-menu", onToggle: (e) => !e.currentTarget.open && setConfirmDelete(false), children: [_jsx("summary", { "aria-label": `More for ${doc.title}`, children: "\u22EF" }), _jsxs("div", { className: "menu", children: [_jsx("button", { type: "button", onClick: (e) => {
                                    e.currentTarget.closest('details').open = false;
                                    setValue(doc.title);
                                    setEditing(true);
                                }, children: "Rename" }), doc.teamId === null &&
                                teams.map((t) => (_jsxs("button", { type: "button", onClick: (e) => {
                                        e.currentTarget.closest('details').open = false;
                                        void setDocTeam(doc.id, t.id);
                                    }, children: ["Move to ", t.name] }, t.id))), confirmDelete ? (_jsx("button", { type: "button", className: "danger strong", onClick: (e) => {
                                    e.currentTarget.closest('details').open = false;
                                    onDelete();
                                }, children: "Delete for good" })) : (_jsx("button", { type: "button", className: "danger", onClick: () => setConfirmDelete(true), children: "Delete\u2026" })), confirmDelete && _jsx("p", { className: "menu-note", children: "Deletes the doc and its version history." })] })] })] }));
}
export function Sidebar({ docs, spaceName, signedOutOnServer, openIds, onOpen, onCreate, onDelete, onImport, }) {
    const fileInput = useRef(null);
    const [dragId, setDragId] = useState(null);
    const [drop, setDrop] = useState(null);
    const endDrag = () => {
        setDragId(null);
        setDrop(null);
    };
    const commit = (e) => {
        e.preventDefault();
        if (dragId && drop)
            void moveDoc(dragId, drop.kind, drop.before);
        endDrag();
    };
    // Drag from the handle with pointer events, so it works on iPads and phones
    // (the browser's built-in drag and drop doesn't work with touch).
    const startHandleDrag = (doc, e) => {
        e.preventDefault();
        const pointerId = e.pointerId;
        setDragId(doc.id);
        let target = null;
        const move = (ev) => {
            if (ev.pointerId !== pointerId)
                return;
            const el = document.elementFromPoint(ev.clientX, ev.clientY);
            const row = el?.closest('[data-doc-id]');
            const list = el?.closest('[data-doc-list]');
            if (row) {
                const box = row.getBoundingClientRect();
                const lower = ev.clientY > box.top + box.height / 2;
                const next = row.nextElementSibling?.dataset.docId ?? null;
                target = { kind: row.dataset.kind, before: lower ? next : row.dataset.docId };
            }
            else if (list) {
                target = { kind: list.dataset.docList, before: null };
            }
            setDrop(target);
        };
        const finish = (commitMove) => () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onCancel);
            if (commitMove && target)
                void moveDoc(doc.id, target.kind, target.before);
            endDrag();
        };
        const onUp = finish(true);
        const onCancel = finish(false);
        // Follow the finger anywhere on the page, not just over the handle.
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onCancel);
    };
    const section = (kind, title, hint) => {
        const list = sortDocs(docs.filter((d) => d.kind === kind));
        return (_jsxs("div", { className: "side-section", children: [_jsxs("div", { className: "side-head", children: [_jsx("h2", { children: title }), _jsxs("span", { className: "side-head-btns", children: [kind === 'reference' && onImport && (_jsxs(_Fragment, { children: [_jsx("button", { type: "button", className: "icon-btn small", title: "Import a file as a reference doc: Word, Excel/CSV, text or Markdown (Google Docs/Sheets: File \u2192 Download first)", "aria-label": "Import a file", onClick: () => fileInput.current?.click(), children: _jsx(IconUpload, {}) }), _jsx("input", { ref: fileInput, type: "file", hidden: true, accept: ".docx,.xlsx,.csv,.txt,.md,.markdown", onChange: (e) => {
                                                const f = e.target.files?.[0];
                                                if (f)
                                                    onImport(f);
                                                e.target.value = '';
                                            } })] })), _jsx("button", { type: "button", className: "icon-btn small", title: `New ${title.toLowerCase()} doc`, "aria-label": `New ${title.toLowerCase()} doc`, onClick: () => onCreate(kind), children: _jsx(IconPlus, {}) })] })] }), _jsx("p", { className: "side-hint", children: hint }), _jsx("ul", { className: 'doc-list' + (drop && drop.kind === kind && drop.before === null ? ' drop-end' : ''), "data-doc-list": kind, onDragOver: (e) => {
                        if (!dragId)
                            return;
                        e.preventDefault();
                        if (e.target === e.currentTarget)
                            setDrop({ kind, before: null });
                    }, onDrop: commit, children: list.map((d, i) => (_jsx(DocRow, { doc: d, openHere: openIds.has(d.id), onOpen: () => onOpen(d.id), onDelete: () => onDelete(d), drag: {
                            onHandleDown: (e) => startHandleDrag(d, e),
                            dragging: dragId === d.id,
                            dropBefore: !!dragId && drop?.kind === kind && drop.before === d.id,
                            onDragStart: (e) => {
                                e.dataTransfer.effectAllowed = 'move';
                                e.dataTransfer.setData('text/plain', d.title);
                                setDragId(d.id);
                            },
                            onDragOver: (e) => {
                                if (!dragId)
                                    return;
                                e.preventDefault();
                                e.stopPropagation();
                                const box = e.currentTarget.getBoundingClientRect();
                                const lowerHalf = e.clientY > box.top + box.height / 2;
                                setDrop({ kind, before: lowerHalf ? (list[i + 1]?.id ?? null) : d.id });
                            },
                            onDrop: commit,
                            onDragEnd: endDrag,
                        } }, d.id))) })] }));
    };
    return (_jsxs("aside", { className: "sidebar", children: [spaceName && _jsx("div", { className: "space-name", children: spaceName }), signedOutOnServer && (_jsx("p", { className: "side-banner", children: "Sign in (top right) to save docs to the server, share them with your partner and join your team. Until then, docs stay on this device." })), section('prep', 'Prep', 'What you type during prep.'), section('reference', 'Reference', 'Coach briefs and notes to read from.'), _jsx("p", { className: "side-foot", children: _jsx("a", { href: "/privacy", target: "_blank", rel: "noreferrer", children: "Privacy" }) })] }));
}
