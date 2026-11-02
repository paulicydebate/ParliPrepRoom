import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { teamRounds } from '../store/account';
import { IconClose } from './icons';
function ago(ms) {
    if (!ms)
        return 'No edits yet';
    const s = Math.round((Date.now() - ms) / 1000);
    if (s < 60)
        return 'just now';
    if (s < 3600)
        return `${Math.round(s / 60)} min ago`;
    if (s < 86400)
        return `${Math.round(s / 3600)} h ago`;
    return new Date(ms).toLocaleDateString([], { month: 'short', day: 'numeric' });
}
function Flags({ s }) {
    const chips = [];
    if (!s.intact)
        chips.push({ text: 'Record does not check out', bad: true });
    if (s.blocked)
        chips.push({ text: `${s.blocked} blocked paste${s.blocked > 1 ? 's' : ''}`, bad: true });
    if (s.large)
        chips.push({ text: `${s.large} large edit${s.large > 1 ? 's' : ''}`, bad: true });
    if (s.roundOff)
        chips.push({ text: 'Round doc turned off', bad: true });
    if (s.roundModeOff)
        chips.push({ text: `Left Round Mode ×${s.roundModeOff}` });
    if (s.awayMs > 60_000)
        chips.push({ text: `${Math.round(s.awayMs / 60_000)} min in other apps` });
    if (s.catchup >= 20)
        chips.push({ text: `${s.catchup.toLocaleString()} characters synced after being offline` });
    if (!chips.length)
        chips.push({ text: 'Nothing flagged' });
    return (_jsx("span", { className: "coach-flags", children: chips.map((c) => (_jsx("span", { className: 'coach-chip' + (c.bad ? ' bad' : c.text === 'Nothing flagged' ? ' ok' : ''), children: c.text }, c.text))) }));
}
/** Coaches: every round doc on the team, problems first. */
export function CoachView({ teamId, teamName, onOpenDoc, onClose }) {
    const ref = useRef(null);
    const [rows, setRows] = useState(null);
    const [error, setError] = useState(null);
    const [onlyFlagged, setOnlyFlagged] = useState(false);
    const load = () => {
        setError(null);
        teamRounds(teamId).then((r) => setRows(r.sort((a, b) => b.summary.flags - a.summary.flags || (b.summary.lastAt ?? 0) - (a.summary.lastAt ?? 0))), (e) => setError(e.message));
    };
    useEffect(() => {
        const d = ref.current;
        if (d && !d.open)
            d.showModal();
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [teamId]);
    const shown = rows?.filter((r) => !onlyFlagged || r.summary.flags > 0) ?? [];
    const flagged = rows?.filter((r) => r.summary.flags > 0).length ?? 0;
    return (_jsxs("dialog", { ref: ref, className: "settings coach-view", onClose: onClose, onCancel: onClose, children: [_jsxs("div", { className: "settings-head", children: [_jsxs("h2", { children: ["Round docs \u00B7 ", teamName] }), _jsx("button", { type: "button", className: "icon-btn", "aria-label": "Close", onClick: onClose, children: _jsx(IconClose, {}) })] }), _jsx("p", { className: "muted", children: "Every round doc on the team, from the server's record (students can't edit it). Docs with something worth a look come first. Open the check page to see every character typed and deleted, by whom and when." }), _jsxs("div", { className: "coach-bar", children: [_jsx("span", { className: "muted small", children: rows ? `${rows.length} round doc${rows.length === 1 ? '' : 's'} · ${flagged} with flags` : 'Loading…' }), _jsx("span", { className: "tb-spacer" }), _jsxs("label", { className: "check", children: [_jsx("input", { type: "checkbox", checked: onlyFlagged, onChange: (e) => setOnlyFlagged(e.target.checked) }), " Only flagged"] }), _jsx("button", { type: "button", className: "btn ghost small", onClick: load, children: "Refresh" })] }), error && _jsx("p", { className: "muted", children: error }), rows && rows.length === 0 && _jsx("p", { className: "muted", children: "No round docs on this team yet. They appear here when a student switches a doc to Round doc." }), _jsx("ul", { className: "coach-list", children: shown.map((r) => (_jsxs("li", { className: r.summary.flags ? 'has-flags' : '', children: [_jsxs("div", { className: "coach-main", children: [_jsx("strong", { className: "coach-title", children: r.title || 'Untitled' }), _jsxs("span", { className: "muted small", children: [[r.owner, ...r.partners].filter(Boolean).join(' · '), " \u00B7 edited ", ago(r.summary.lastAt), " \u00B7 ", r.summary.typedLive.toLocaleString(), " characters typed live"] }), _jsx(Flags, { s: r.summary })] }), _jsxs("div", { className: "coach-actions", children: [_jsx("button", { type: "button", className: "btn small", onClick: () => {
                                        onOpenDoc(r.id);
                                        onClose();
                                    }, children: "Open doc" }), r.checkToken && (_jsx("a", { className: "btn small primary", href: `/check/${r.checkToken}`, target: "_blank", rel: "noreferrer", children: "Check page" }))] })] }, r.id))) })] }));
}
