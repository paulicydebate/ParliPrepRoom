import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { toast } from '../editor/roundGuard';
import { PERSONAL, createTournament, lookupTournament, myTournaments, teamDetails, useAccount, } from '../store/account';
import { createRoundDoc } from '../store/docs';
import { acquireDoc, releaseDoc } from '../store/registry';
import { setRound } from '../store/roundDoc';
import { writeLines } from '../store/seed';
import { choose, format, formatMinutes, loadPresets, parseMinutes, prepMinutes, savePresets } from '../store/timer';
import { IconClose } from './icons';
const LAST_TOURNAMENT = 'pp-last-tournament';
function useModal(onClose) {
    const ref = useRef(null);
    useEffect(() => {
        const d = ref.current;
        if (d && !d.open)
            d.showModal();
    }, []);
    return { ref, onClose, onCancel: onClose };
}
const remembered = () => {
    try {
        return localStorage.getItem(LAST_TOURNAMENT) ?? '';
    }
    catch {
        return '';
    }
};
/**
 * "New round": one step to a round doc for you and your partner, tagged with
 * the tournament and round, with the prep timer started.
 */
export function NewRoundDialog({ onCreated, onClose }) {
    const modal = useModal(onClose);
    const acct = useAccount();
    const inTeam = acct.space !== PERSONAL;
    const [round, setRoundLabel] = useState('Round 1');
    const [side, setSide] = useState('gov');
    const [resolution, setResolution] = useState('');
    const [members, setMembers] = useState([]);
    const [partner, setPartner] = useState('');
    const [code, setCode] = useState(remembered);
    const [tournament, setTournament] = useState(null);
    const [codeError, setCodeError] = useState(null);
    const [startTimer, setStartTimer] = useState(true);
    const [prep, setPrep] = useState(() => formatMinutes(prepMinutes()));
    const prepLen = parseMinutes(prep);
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        if (!inTeam)
            return;
        void teamDetails(acct.space).then((t) => setMembers(t.members.filter((m) => m.userId !== acct.user?.id)), () => setMembers([]));
    }, [inTeam, acct.space, acct.user?.id]);
    const check = async (value) => {
        setTournament(null);
        setCodeError(null);
        if (!value.trim())
            return;
        try {
            setTournament(await lookupTournament(value.trim()));
        }
        catch {
            setCodeError('No tournament with that code.');
        }
    };
    useEffect(() => {
        if (code)
            void check(code);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const create = async () => {
        setBusy(true);
        try {
            const label = round.trim() || 'Round';
            const res = resolution.trim();
            const title = `${label} · ${side === 'gov' ? 'Gov' : 'Opp'}${res ? ` · ${res.slice(0, 48)}${res.length > 48 ? '…' : ''}` : ''}`;
            const meta = await createRoundDoc({
                title,
                space: acct.space,
                partners: partner ? [partner] : [],
                tournamentCode: tournament ? code.trim() : null,
                roundLabel: label,
            });
            try {
                if (tournament)
                    localStorage.setItem(LAST_TOURNAMENT, code.trim().toUpperCase());
            }
            catch {
                // ignore
            }
            // Starting content, the round-doc switch and the prep timer live inside the doc.
            const { doc, ready } = acquireDoc(meta.id);
            await ready;
            const lines = [];
            if (res)
                lines.push(['note', `Resolution: ${res}`]);
            lines.push(['position', side === 'gov' ? 'Gov case' : 'Opp case', { side }], ['claim', '']);
            writeLines(doc, lines);
            setRound(doc, meta.id, true);
            // Remember this prep length as the Prep button's time on this device.
            if (startTimer && prepLen && prepLen !== prepMinutes()) {
                const presets = loadPresets();
                const has = presets.some((p) => p.label.toLowerCase() === 'prep');
                savePresets(has ? presets.map((p) => (p.label.toLowerCase() === 'prep' ? { ...p, minutes: prepLen } : p)) : [{ label: 'Prep', minutes: prepLen }, ...presets]);
            }
            if (startTimer && prepLen)
                doc.getMap('timer').set('state', choose('Prep', prepLen, true));
            releaseDoc(meta.id);
            onCreated(meta.id);
            toast(startTimer && prepLen ? `Round doc ready. Prep timer started: ${format(prepLen * 60_000)}.` : 'Round doc ready.');
            onClose();
        }
        catch (e) {
            toast(e.message);
            setBusy(false);
        }
    };
    const students = members.filter((m) => m.role === 'student');
    return (_jsx("dialog", { ...modal, className: "settings new-round", children: _jsxs("form", { onSubmit: (e) => {
                e.preventDefault();
                void create();
            }, children: [_jsxs("div", { className: "settings-head", children: [_jsx("h2", { children: "New round" }), _jsx("button", { type: "button", className: "icon-btn", "aria-label": "Close", onClick: onClose, children: _jsx(IconClose, {}) })] }), _jsxs("p", { className: "muted", children: ["Makes a round doc for you", inTeam ? ' and your partner' : '', ": paste off, typing recorded, shared live. It opens as a doc and a flow side by side."] }), _jsxs("div", { className: "form-grid", children: [_jsxs("label", { children: [_jsx("span", { children: "Round" }), _jsx("input", { className: "name-input", value: round, onChange: (e) => setRoundLabel(e.target.value), placeholder: "Round 3" })] }), _jsxs("div", { children: [_jsx("span", { className: "form-label", children: "Side" }), _jsxs("div", { className: "seg", role: "group", "aria-label": "Side", children: [_jsx("button", { type: "button", className: side === 'gov' ? 'is-on' : '', onClick: () => setSide('gov'), children: "Gov" }), _jsx("button", { type: "button", className: side === 'opp' ? 'is-on' : '', onClick: () => setSide('opp'), children: "Opp" })] })] })] }), _jsxs("label", { className: "form-row", children: [_jsx("span", { children: "Resolution" }), _jsx("textarea", { className: "name-input area", rows: 2, value: resolution, onChange: (e) => setResolution(e.target.value), placeholder: "This House would\u2026" })] }), inTeam && (_jsxs("label", { className: "form-row", children: [_jsx("span", { children: "Partner" }), _jsxs("select", { className: "name-input", value: partner, onChange: (e) => setPartner(e.target.value), children: [_jsx("option", { value: "", children: "No partner" }), students.map((m) => (_jsx("option", { value: m.userId, children: m.name }, m.userId)))] })] })), _jsxs("label", { className: "form-row", children: [_jsx("span", { children: "Tournament code (optional)" }), _jsx("input", { className: "name-input", value: code, onChange: (e) => setCode(e.target.value.toUpperCase()), onBlur: (e) => void check(e.target.value), placeholder: "From the tournament, e.g. K7Q2MX", autoCapitalize: "characters" }), tournament && _jsxs("span", { className: "form-ok", children: ["\u2713 ", tournament.name, ": the tab room can check this round doc."] }), codeError && _jsx("span", { className: "form-err", children: codeError })] }), _jsxs("div", { className: "check form-row prep-row", children: [_jsxs("label", { children: [_jsx("input", { type: "checkbox", checked: startTimer, onChange: (e) => setStartTimer(e.target.checked) }), " Start the prep timer:"] }), _jsx("input", { className: "name-input prep-len", value: prep, onChange: (e) => setPrep(e.target.value), inputMode: "decimal", "aria-label": "Prep length in minutes", disabled: !startTimer }), _jsx("span", { className: "muted small", children: "minutes" }), startTimer && !prepLen && _jsx("span", { className: "form-err", children: "Type a length like 25 or 22:30." })] }), _jsxs("div", { className: "settings-foot", children: [_jsx("button", { type: "button", className: "btn ghost", onClick: onClose, children: "Cancel" }), _jsx("button", { type: "submit", className: "btn primary", disabled: busy || (!!code.trim() && !tournament && !codeError) || !!codeError || (startTimer && !prepLen), children: "Start round" })] })] }) }));
}
/** Set up a tournament and get its code and the director's link. */
export function TournamentsDialog({ onClose }) {
    const modal = useModal(onClose);
    const [list, setList] = useState(null);
    const [name, setName] = useState('');
    const load = () => void myTournaments().then(setList, () => setList([]));
    useEffect(load, []);
    const copy = async (text, what) => {
        try {
            await navigator.clipboard.writeText(text);
            toast(`${what} copied.`);
        }
        catch {
            toast('Copy it from the box.');
        }
    };
    return (_jsxs("dialog", { ...modal, className: "settings tournaments", children: [_jsxs("div", { className: "settings-head", children: [_jsx("h2", { children: "Tournaments (tab room)" }), _jsx("button", { type: "button", className: "icon-btn", "aria-label": "Close", onClick: onClose, children: _jsx(IconClose, {}) })] }), _jsxs("p", { className: "muted", children: ["Set up a tournament, give teams its ", _jsx("strong", { children: "code" }), " (they enter it when they start a round), and give the ", _jsx("strong", { children: "director link" }), " to the tab room. That link shows every tagged round doc and its full record, including the prep text, without signing in, so keep it private."] }), _jsxs("form", { className: "row-inline", onSubmit: async (e) => {
                    e.preventDefault();
                    if (!name.trim())
                        return;
                    await createTournament(name.trim());
                    setName('');
                    load();
                }, children: [_jsx("input", { className: "name-input", value: name, onChange: (e) => setName(e.target.value), placeholder: "Tournament name, e.g. Fall Classic 2026", "aria-label": "Tournament name" }), _jsx("button", { type: "submit", className: "btn primary", disabled: !name.trim(), children: "Create" })] }), _jsxs("ul", { className: "tournament-list", children: [list?.length === 0 && _jsx("li", { className: "muted", children: "You haven't set up any tournaments." }), list?.map((t) => {
                        const link = `${location.origin}/td/${t.directorSecret}`;
                        return (_jsxs("li", { children: [_jsx("strong", { children: t.name }), _jsxs("div", { className: "t-row", children: [_jsxs("span", { children: ["Code for teams: ", _jsx("code", { className: "t-code", children: t.code })] }), _jsx("button", { type: "button", className: "btn small", onClick: () => void copy(t.code, 'Code'), children: "Copy code" })] }), _jsxs("div", { className: "t-row", children: [_jsx("code", { className: "invite-link", children: link }), _jsx("button", { type: "button", className: "btn small", onClick: () => void copy(link, 'Director link'), children: "Copy director link" }), _jsx("a", { className: "btn small ghost", href: link, target: "_blank", rel: "noreferrer", children: "Open" })] })] }, t.id));
                    })] })] }));
}
