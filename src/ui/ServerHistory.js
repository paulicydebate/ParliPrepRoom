import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from '../editor/roundGuard';
import { diffBlocks, flattenDoc, summarize } from '../history/diff';
import { DocReplayer, decodeLog, sessionsOf } from '../history/timeline';
import { docLog } from '../store/account';
import { colorFor } from '../store/sync';
import { logEvent } from '../store/typingLog';
import { DiffLines, Line } from './HistoryView';
const time = (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const timeS = (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
const day = (t) => {
    const d = new Date(t);
    const today = new Date();
    const y = new Date();
    y.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString())
        return 'Today';
    if (d.toDateString() === y.toDateString())
        return 'Yesterday';
    return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
};
/** Load and decode the server's record for a doc. */
function useRecord(docId) {
    const [updates, setUpdates] = useState(null);
    const [error, setError] = useState(null);
    const load = () => {
        setError(null);
        docLog(docId).then((log) => setUpdates(decodeLog(log)), (e) => setError(e.message));
    };
    useEffect(load, [docId]);
    const replayer = useMemo(() => (updates ? new DocReplayer(updates) : null), [updates]);
    return { updates, replayer, error, reload: load };
}
/**
 * History (edit sessions by person, from the server) or Replay (scrub
 * through every edit). Both show everyone's edits, not just this device's.
 */
export function ServerHistory({ mode, docId, editor, round, tabs, onClose, }) {
    const { updates, replayer, error, reload } = useRecord(docId);
    return (_jsx("div", { className: "history", children: _jsxs("div", { className: "history-main", children: [_jsxs("div", { className: "history-bar", children: [tabs, _jsx("span", { className: "tb-spacer" }), _jsx("button", { type: "button", className: "btn ghost small", onClick: reload, title: "Load the latest edits", children: "Refresh" }), mode === 'replay' && (_jsx("button", { type: "button", className: "btn ghost", onClick: onClose, children: "Done" }))] }), error && _jsx("p", { className: "muted history-pad", children: error }), !error && !updates && _jsx("p", { className: "muted history-pad", children: "Loading the record\u2026" }), updates && replayer && mode === 'history' && _jsx(Sessions, { updates: updates, replayer: replayer, editor: editor, round: round, docId: docId, onClose: onClose }), updates && replayer && mode === 'replay' && _jsx(Replay, { updates: updates, replayer: replayer })] }) }));
}
function Sessions({ updates, replayer, editor, round, docId, onClose, }) {
    const sessions = useMemo(() => sessionsOf(updates).reverse(), [updates]);
    const [sel, setSel] = useState(sessions[0] ?? null);
    const [view, setView] = useState('changes');
    const [confirm, setConfirm] = useState(false);
    useEffect(() => setConfirm(false), [sel]);
    const before = useMemo(() => (sel ? replayer.jsonAt(sel.from - 1) : null), [sel, replayer]);
    const after = useMemo(() => (sel ? replayer.jsonAt(sel.to) : null), [sel, replayer]);
    const now = useMemo(() => replayer.jsonAt(updates.length - 1), [replayer, updates.length]);
    const rows = useMemo(() => {
        if (!before || !after)
            return [];
        return view === 'since' ? diffBlocks(flattenDoc(after), flattenDoc(now)) : diffBlocks(flattenDoc(before), flattenDoc(after));
    }, [before, after, now, view]);
    const stats = summarize(rows);
    const restore = () => {
        if (!editor || !after || !sel)
            return;
        if (round)
            logEvent(docId, { k: 'restore', s: `${day(sel.end)} ${time(sel.end)} (after ${sel.name}'s edits)` });
        editor.commands.setContent(after);
        toast('Restored. The restore itself is in the history too, so it can be undone the same way.');
        onClose();
    };
    if (!sessions.length)
        return _jsx("p", { className: "muted history-pad", children: "No edits on the server yet." });
    let lastDay = '';
    return (_jsxs("div", { className: "history server-history", children: [_jsx("div", { className: "history-main", children: sel && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "history-bar sub", children: [_jsx("span", { className: "who-dot", style: { background: colorFor(sel.userId) } }), _jsx("strong", { children: sel.name }), _jsxs("span", { className: "muted small", children: [day(sel.start), " ", time(sel.start), sel.end - sel.start > 60_000 ? `–${time(sel.end)}` : '', " \u00B7 +", sel.inserted.toLocaleString(), " / \u2212", sel.deleted.toLocaleString(), " characters", sel.catchup ? ' · synced after being offline' : ''] }), _jsx("span", { className: "tb-spacer" }), _jsxs("div", { className: "seg", role: "group", "aria-label": "Show", children: [_jsx("button", { type: "button", className: view === 'changes' ? 'is-on' : '', onClick: () => setView('changes'), children: "What changed" }), _jsx("button", { type: "button", className: view === 'doc' ? 'is-on' : '', onClick: () => setView('doc'), children: "Doc then" }), _jsx("button", { type: "button", className: view === 'since' ? 'is-on' : '', onClick: () => setView('since'), children: "Since then" })] }), confirm ? (_jsxs("span", { className: "confirm", children: [_jsx("button", { type: "button", className: "btn ghost small", onClick: () => setConfirm(false), children: "Cancel" }), _jsx("button", { type: "button", className: "btn primary small", onClick: restore, children: "Restore" })] })) : (_jsx("button", { type: "button", className: "btn small", disabled: !editor, onClick: () => setConfirm(true), title: "Put the doc back the way it was right after these edits", children: "Restore to this point" }))] }), view !== 'doc' && (_jsx("p", { className: "history-summary", children: stats.added + stats.changed + stats.removed === 0
                                ? view === 'since'
                                    ? 'No changes since this point.'
                                    : 'No visible text changes (formatting or styles only).'
                                : `${stats.added} added, ${stats.changed} edited, ${stats.removed} removed${view === 'since' ? ' since then' : ` by ${sel.name}`}.` })), _jsxs("div", { className: "pp-doc history-doc who-diff", style: { ['--who']: colorFor(sel.userId) }, children: [view === 'doc' && after && flattenDoc(after).map((b, i) => _jsx(Line, { block: b }, i)), view !== 'doc' && _jsx(DiffLines, { rows: rows, changesOnly: view === 'changes' })] })] })) }), _jsxs("aside", { className: "history-list", "aria-label": "Edit sessions", children: [_jsxs("div", { className: "history-list-head", children: [_jsx("strong", { children: "Who changed what" }), _jsx("button", { type: "button", className: "btn ghost", onClick: onClose, children: "Done" })] }), _jsx("p", { className: "muted small", children: "From the server: every edit by everyone, grouped into sessions with no pause over 2 minutes." }), _jsx("ul", { children: sessions.map((s) => {
                            const d = day(s.start);
                            const header = d !== lastDay ? (_jsx("li", { className: "day", children: d }, `d-${s.index}`)) : null;
                            lastDay = d;
                            return [
                                header,
                                _jsx("li", { children: _jsxs("button", { type: "button", className: 'version session' + (sel?.index === s.index ? ' is-on' : ''), onClick: () => setSel(s), children: [_jsx("span", { className: "who-dot", style: { background: colorFor(s.userId) } }), _jsxs("span", { className: "v-name", children: [s.name, _jsxs("span", { className: "muted small", children: [' ', "+", s.inserted, " / \u2212", s.deleted, s.catchup ? ' · offline' : ''] })] }), _jsx("span", { className: "v-time", children: time(s.start) })] }) }, s.index),
                            ];
                        }) })] })] }));
}
/** Scrub or play through every edit. */
function Replay({ updates, replayer }) {
    const [i, setI] = useState(updates.length - 1);
    const [playing, setPlaying] = useState(false);
    const [speed, setSpeed] = useState(8);
    const timer = useRef(null);
    useEffect(() => {
        if (!playing)
            return;
        timer.current = setInterval(() => {
            setI((x) => {
                if (x >= updates.length - 1) {
                    setPlaying(false);
                    return x;
                }
                return x + 1;
            });
        }, 1000 / speed);
        return () => {
            if (timer.current)
                clearInterval(timer.current);
        };
    }, [playing, speed, updates.length]);
    const json = useMemo(() => replayer.jsonAt(i), [replayer, i]);
    const u = updates[i];
    const people = useMemo(() => [...new Map(updates.map((x) => [x.userId, x.name])).entries()], [updates]);
    return (_jsxs("div", { className: "replay", children: [_jsxs("div", { className: "replay-controls", children: [_jsx("button", { type: "button", className: "btn primary small", onClick: () => {
                            if (!playing && i >= updates.length - 1)
                                setI(-1);
                            setPlaying((p) => !p);
                        }, children: playing ? 'Pause' : i >= updates.length - 1 ? 'Play from start' : 'Play' }), _jsx("input", { type: "range", min: -1, max: updates.length - 1, value: i, onChange: (e) => {
                            setPlaying(false);
                            setI(Number(e.target.value));
                        }, "aria-label": "Position in the record" }), _jsxs("select", { value: speed, onChange: (e) => setSpeed(Number(e.target.value)), "aria-label": "Speed", children: [_jsx("option", { value: 2, children: "Slow" }), _jsx("option", { value: 8, children: "Normal" }), _jsx("option", { value: 30, children: "Fast" }), _jsx("option", { value: 120, children: "Very fast" })] })] }), _jsx("div", { className: "replay-now", children: u ? (_jsxs(_Fragment, { children: [_jsx("span", { className: "who-dot", style: { background: colorFor(u.userId) } }), _jsx("strong", { children: u.name }), _jsxs("span", { className: "muted small", children: [day(u.at), " ", timeS(u.at), " \u00B7 edit ", i + 1, " of ", updates.length, u.via !== 'live' ? ' · synced after being offline' : ''] }), _jsxs("span", { className: "replay-edit", children: [u.deletedText && _jsx("del", { children: u.deletedText.slice(0, 80) }), u.text && _jsx("ins", { style: { background: `color-mix(in srgb, ${colorFor(u.userId)} 25%, transparent)` }, children: u.text.slice(0, 80) })] })] })) : (_jsx("span", { className: "muted small", children: "Start: empty doc" })) }), _jsx("div", { className: "replay-people", children: people.map(([id, name]) => (_jsxs("span", { className: "replay-person", children: [_jsx("span", { className: "who-dot", style: { background: colorFor(id) } }), " ", name] }, id))) }), _jsx("div", { className: "pp-doc history-doc", children: flattenDoc(json).map((b, k) => _jsx(Line, { block: b }, k)) })] }));
}
