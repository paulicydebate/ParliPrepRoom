import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { burstsOf, logChanged, readLog, summarizeLog } from '../store/typingLog';
const time = (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
const day = (t) => new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' });
function minutes(ms) {
    if (ms < 60_000)
        return `${Math.round(ms / 1000)} s`;
    return `${Math.round(ms / 60_000)} min`;
}
const LABEL = {
    type: 'Typed',
    delete: 'Deleted',
    large: 'Large edit',
    'paste-blocked': 'Paste blocked',
    'drop-blocked': 'Drop blocked',
    'round-on': 'Round doc turned on',
    'round-off': 'Round doc turned off',
    restore: 'Restored a version',
    'roundmode-on': 'Round Mode on',
    'roundmode-off': 'Round Mode off',
    away: 'Left the app',
    back: 'Came back',
};
/** Events worth a reviewer's attention (typing itself is summarized, not listed). */
const NOTABLE = new Set(['large', 'paste-blocked', 'drop-blocked', 'round-on', 'round-off', 'roundmode-on', 'roundmode-off', 'restore', 'away', 'back']);
export function TypingLogView({ docId, checkToken }) {
    const [report, setReport] = useState(null);
    useEffect(() => {
        let live = true;
        const load = () => void readLog(docId).then((r) => live && setReport(r));
        load();
        const off = logChanged.subscribe(load);
        return () => {
            live = false;
            off();
        };
    }, [docId]);
    const fullRecord = checkToken ? (_jsxs("div", { className: "log-banner", children: [_jsxs("p", { children: [_jsx("strong", { children: "This tab only shows typing done on this device." }), " The full record, with every character typed and deleted by everyone on this doc, is kept on the server."] }), _jsx("a", { className: "btn primary small", href: `/check/${checkToken}`, target: "_blank", rel: "noreferrer", children: "Open the full record" })] })) : null;
    if (!report)
        return _jsxs("div", { className: "log-view muted", children: [fullRecord, "Loading the typing log\u2026"] });
    if (!report.events.length) {
        return (_jsxs("div", { className: "log-view", children: [fullRecord, _jsx("p", { className: "muted", children: "Nothing logged yet. Typing is recorded while this is a round doc." })] }));
    }
    const s = summarizeLog(report.events);
    const notable = report.events.filter((e) => NOTABLE.has(e.k));
    return (_jsxs("div", { className: "log-view", children: [fullRecord, _jsxs("div", { className: 'seal' + (report.intact ? ' ok' : ' bad'), children: [_jsxs("div", { children: [_jsx("div", { className: "seal-label", children: "Seal code" }), _jsx("div", { className: "seal-code", children: report.seal })] }), _jsx("p", { children: report.intact
                            ? 'Log is intact: every entry checks out against the one before it.'
                            : 'Log does not check out: entries were changed or removed after they were written.' })] }), _jsxs("dl", { className: "log-stats", children: [_jsxs("div", { children: [_jsx("dt", { children: "Logged" }), _jsx("dd", { children: s.first && s.last ? `${day(s.first)}, ${time(s.first)} – ${time(s.last)}` : '—' })] }), _jsxs("div", { children: [_jsx("dt", { children: "Characters typed" }), _jsx("dd", { children: s.typed.toLocaleString() })] }), _jsxs("div", { children: [_jsx("dt", { children: "Characters deleted" }), _jsx("dd", { children: s.deleted.toLocaleString() })] }), _jsxs("div", { children: [_jsx("dt", { children: "Pastes / drops blocked" }), _jsx("dd", { className: s.blocked ? 'warn' : '', children: s.blocked })] }), _jsxs("div", { children: [_jsx("dt", { children: "Large edits" }), _jsx("dd", { className: s.large ? 'warn' : '', children: s.large })] }), _jsxs("div", { children: [_jsx("dt", { children: "Time in other apps" }), _jsx("dd", { children: minutes(s.awayMs) })] })] }), s.byAuthor.size > 0 && (_jsxs(_Fragment, { children: [_jsx("h4", { children: "Who typed" }), _jsx("ul", { className: "log-authors", children: [...s.byAuthor].map(([name, a]) => (_jsxs("li", { children: [_jsx("strong", { children: name }), " typed ", a.typed.toLocaleString(), " characters, deleted ", a.deleted.toLocaleString()] }, name))) })] })), _jsx("h4", { children: "Events to check" }), notable.length === 0 && _jsx("p", { className: "muted", children: "None: only typing and deleting." }), _jsx("ul", { className: "log-events", children: notable.map((e, i) => (_jsxs("li", { "data-kind": e.k, children: [_jsx("span", { className: "log-time", children: time(e.t) }), _jsx("span", { className: "log-who", children: e.a ?? '' }), _jsxs("span", { className: "log-what", children: [LABEL[e.k], e.k === 'large' && e.n ? ` (${e.n} characters at once)` : '', (e.k === 'paste-blocked' || e.k === 'drop-blocked') && e.n ? ` (${e.n} characters)` : '', e.k === 'restore' && e.s ? `: ${e.s}` : ''] }), e.k === 'large' && e.s && _jsxs("span", { className: "log-text", children: ["\u201C", e.s, "\u201D"] })] }, i))) }), _jsx("h4", { children: "Everything typed, in order" }), _jsxs("p", { className: "muted", children: ["Grouped into bursts with no pause over 4 seconds. ", _jsx("ins", { children: "Typed text" }), " ", _jsx("del", { children: "deleted text" })] }), _jsx("ol", { className: "log-bursts", children: burstsOf(report.events).map((b, i) => (_jsxs("li", { children: [_jsxs("div", { className: "burst-meta", children: [_jsx("span", { className: "log-time", children: time(b.start) }), _jsx("span", { className: "log-who", children: b.author })] }), _jsx("div", { className: "burst-text", children: b.parts.map((p, j) => p.kind === 'removed' ? (_jsx("del", { children: p.text }, j)) : p.kind === 'large' ? (_jsx("mark", { title: "Inserted in one go", children: p.text }, j)) : (_jsx("ins", { children: p.text }, j))) })] }, i))) }), _jsx("p", { className: "muted small-print", children: "This records what happened in this app on this device. It can\u2019t see another screen or phone." })] }));
}
