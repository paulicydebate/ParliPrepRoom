import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { toast } from '../editor/roundGuard';
import { serverNow } from '../store/account';
import { DEFAULT_PRESETS, adjust, choose, format, formatMinutes, parseMinutes, pause, reset, savePresets, start, timeLeft, usePresets, useTimer, } from '../store/timer';
/**
 * Top-bar timer: prep, speeches and flex periods. On a round doc it's shared
 * with the partner (both see the same countdown).
 */
export function Timer({ doc }) {
    const { state, shared, set } = useTimer(doc);
    const [now, setNow] = useState(serverNow());
    const [custom, setCustom] = useState('');
    const [customLabel, setCustomLabel] = useState('');
    const [editing, setEditing] = useState(false);
    const presets = usePresets();
    const menu = useRef(null);
    const running = state.endsAt !== null;
    const left = timeLeft(state, now);
    const done = running && left <= 0;
    useEffect(() => {
        if (!running)
            return;
        const t = setInterval(() => setNow(serverNow()), 250);
        return () => clearInterval(t);
    }, [running]);
    // Say so once when time runs out.
    const announced = useRef(null);
    useEffect(() => {
        if (done && announced.current !== state.endsAt) {
            announced.current = state.endsAt;
            toast(`Time: ${state.label} is over.`);
        }
    }, [done, state.endsAt, state.label]);
    const pick = (label, minutes) => {
        set(choose(label, minutes, true));
        if (menu.current)
            menu.current.open = false;
    };
    const warn = running && left <= 60_000 && !done;
    return (_jsxs("div", { className: 'timer' + (running ? ' is-running' : '') + (warn ? ' is-warn' : '') + (done ? ' is-done' : ''), children: [_jsxs("details", { className: "timer-menu", ref: menu, children: [_jsxs("summary", { title: shared ? 'Timer shared with everyone on this round doc' : 'Timer (on this device)', children: [_jsx("span", { className: "timer-label", children: state.label }), _jsx("span", { className: "timer-time", children: format(left) }), shared && _jsx("span", { className: "timer-shared", "aria-label": "Shared" })] }), _jsxs("div", { className: "menu timer-pop", children: [editing ? (_jsx(PresetEditor, { presets: presets, onDone: () => setEditing(false) })) : (_jsxs(_Fragment, { children: [_jsx("div", { className: "timer-presets", children: presets.map((p, i) => (_jsxs("button", { type: "button", onClick: () => pick(p.label, p.minutes), children: [_jsx("strong", { children: p.label }), " ", format(p.minutes * 60_000)] }, i))) }), _jsxs("form", { className: "timer-custom", onSubmit: (e) => {
                                            e.preventDefault();
                                            const m = parseMinutes(custom);
                                            if (m === null) {
                                                toast('Type a length like 25, 2.5 or 2:30.');
                                                return;
                                            }
                                            pick(customLabel.trim() || 'Timer', m);
                                            setCustom('');
                                            setCustomLabel('');
                                        }, children: [_jsx("input", { className: "timer-name", value: customLabel, onChange: (e) => setCustomLabel(e.target.value), placeholder: "Name", "aria-label": "Timer name", maxLength: 12 }), _jsx("input", { value: custom, onChange: (e) => setCustom(e.target.value), inputMode: "decimal", placeholder: "Min, e.g. 25 or 2:30", "aria-label": "Length in minutes" }), _jsx("button", { type: "submit", className: "btn small", children: "Start" })] }), _jsxs("div", { className: "timer-adjust", children: [_jsx("span", { className: "muted small", children: "Current timer" }), _jsx("button", { type: "button", className: "btn small ghost", onClick: () => set(adjust(state, -60_000)), children: "\u22121:00" }), _jsx("button", { type: "button", className: "btn small ghost", onClick: () => set(adjust(state, 60_000)), children: "+1:00" }), _jsx("span", { className: "tb-spacer" }), _jsx("button", { type: "button", className: "btn small ghost", onClick: () => setEditing(true), children: "Change times" })] })] })), _jsx("p", { className: "muted small", children: shared ? 'Shared: your partner sees and controls the same timer.' : 'Open a round doc to share the timer with your partner.' })] })] }), _jsx("button", { type: "button", className: "timer-btn", "aria-label": running ? 'Pause timer' : 'Start timer', title: running ? 'Pause' : 'Start', onClick: () => set(running ? pause(state) : start(left <= 0 ? reset(state) : state)), children: running ? '❚❚' : '▶' }), _jsx("button", { type: "button", className: "timer-btn", "aria-label": "Reset timer", title: "Reset", onClick: () => set(reset(state)), children: "\u21BA" })] }));
}
/** Change the preset buttons' names and lengths (saved on this device). */
function PresetEditor({ presets, onDone }) {
    const [rows, setRows] = useState(() => presets.map((p) => ({ label: p.label, time: formatMinutes(p.minutes) })));
    const bad = rows.map((r) => !r.label.trim() || parseMinutes(r.time) === null);
    const save = () => {
        if (bad.some(Boolean)) {
            toast('Each timer needs a name and a length like 25, 2.5 or 2:30.');
            return;
        }
        savePresets(rows.map((r) => ({ label: r.label.trim(), minutes: parseMinutes(r.time) })));
        onDone();
    };
    const edit = (i, patch) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    return (_jsxs("div", { className: "timer-edit", children: [_jsx("p", { className: "muted small", children: "Times are saved on this device. Lengths in minutes: 25, 2.5 or 2:30." }), _jsx("ul", { children: rows.map((r, i) => (_jsxs("li", { className: bad[i] ? 'is-bad' : '', children: [_jsx("input", { value: r.label, onChange: (e) => edit(i, { label: e.target.value }), "aria-label": "Name", maxLength: 12 }), _jsx("input", { value: r.time, onChange: (e) => edit(i, { time: e.target.value }), inputMode: "decimal", "aria-label": `${r.label} length` }), _jsx("button", { type: "button", className: "icon-btn", "aria-label": `Remove ${r.label}`, onClick: () => setRows((rs) => rs.filter((_, j) => j !== i)), children: "\u00D7" })] }, i))) }), _jsxs("div", { className: "timer-adjust", children: [_jsx("button", { type: "button", className: "btn small ghost", onClick: () => setRows((rs) => [...rs, { label: 'Timer', time: '5' }]), children: "+ Add" }), _jsx("button", { type: "button", className: "btn small ghost", onClick: () => setRows(DEFAULT_PRESETS.map((p) => ({ label: p.label, time: formatMinutes(p.minutes) }))), children: "Defaults" }), _jsx("span", { className: "tb-spacer" }), _jsx("button", { type: "button", className: "btn small ghost", onClick: onDone, children: "Cancel" }), _jsx("button", { type: "button", className: "btn small primary", onClick: save, disabled: !rows.length, children: "Save" })] })] }));
}
