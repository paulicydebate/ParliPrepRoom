import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from '../editor/roundGuard';
import { PERSONAL, getAccount, joinTeam, loadAccount, postDocEvents, setSpace, syncing, useAccount } from '../store/account';
import { addSharedDoc, createDoc, deleteDoc, listDocs, onServer, spaceOf, syncDocList, uploadLocalDocs } from '../store/docs';
import { setLogUploader } from '../store/typingLog';
import { AccountBar } from './Account';
import { BlockFinder, PinBoard } from './RoundModeUI';
import { NewRoundDialog } from './Rounds';
import { Timer } from './Timer';
import { useYDoc } from './useYDoc';
import { useLibrary } from './useLibrary';
import { activeSheet, flowKey } from '../editor/flowView';
import { baseSpeech } from '../model/speeches';
import { setRoundMode, useRoundMode } from '../store/roundMode';
import { acquireDoc, destroyDocData, flushAutoVersions, releaseDoc } from '../store/registry';
import { SAMPLE_PREP, SAMPLE_REFERENCE, STARTER_LINES, writeJSON, writeLines } from '../store/seed';
import { deleteAllVersions } from '../store/versions';
import { useDocs } from './hooks';
import { IconMenu, IconPin, IconSearch, IconSettings, IconSplit } from './icons';
import { Pane } from './Pane';
import { NameDialog } from './NameDialog';
import { SettingsDialog } from './SettingsDialog';
import { Sidebar } from './Sidebar';
const MAX_PANES = 3;
const LAYOUT_KEY = 'pp-layout-v1';
const paneKey = () => Math.random().toString(36).slice(2, 10);
function defaultLayout() {
    return { panes: [{ key: paneKey(), docId: null, outline: false }], weights: [1], focused: 0, sidebar: true };
}
function loadLayout() {
    try {
        const raw = localStorage.getItem(LAYOUT_KEY);
        if (!raw)
            return defaultLayout();
        const l = JSON.parse(raw);
        if (!Array.isArray(l.panes) || !l.panes.length)
            return defaultLayout();
        const panes = l.panes.slice(0, MAX_PANES);
        const weights = panes.map((_, i) => (Number(l.weights?.[i]) > 0 ? Number(l.weights[i]) : 1));
        return { panes, weights, focused: Math.min(l.focused ?? 0, panes.length - 1), sidebar: l.sidebar ?? true };
    }
    catch {
        return defaultLayout();
    }
}
async function makeDoc(title, kind, lines, space) {
    const meta = await createDoc({ title, kind, space });
    const { doc, ready } = acquireDoc(meta.id);
    await ready;
    writeLines(doc, lines);
    releaseDoc(meta.id);
    return meta;
}
/** First visit: add one sample reference doc and one sample prep doc, side by side. */
async function seedFirstRun() {
    try {
        if (localStorage.getItem('pp-seeded')) {
            // Browsers that saw the first preview get the flow sample once.
            if (!localStorage.getItem('pp-seeded-flow')) {
                localStorage.setItem('pp-seeded-flow', '1');
                const flow = await makeDoc('Sample flow: facial recognition', 'prep', SAMPLE_PREP, PERSONAL);
                return {
                    panes: [
                        { key: paneKey(), docId: flow.id, outline: false, view: 'doc' },
                        { key: paneKey(), docId: flow.id, outline: false, view: 'flow' },
                    ],
                    weights: [1, 1.4],
                    focused: 1,
                    sidebar: true,
                };
            }
            return null;
        }
        localStorage.setItem('pp-seeded', '1');
        localStorage.setItem('pp-seeded-flow', '1');
    }
    catch {
        return null;
    }
    if ((await listDocs()).length)
        return null;
    const ref = await makeDoc('Sample brief: facial recognition', 'reference', SAMPLE_REFERENCE, PERSONAL);
    const prep = await makeDoc('Sample prep: facial recognition', 'prep', SAMPLE_PREP, PERSONAL);
    return {
        panes: [
            { key: paneKey(), docId: ref.id, outline: false },
            { key: paneKey(), docId: prep.id, outline: true },
        ],
        weights: [1, 1.25],
        focused: 1,
        sidebar: true,
    };
}
function useMedia(query) {
    const [narrow, setNarrow] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(query).matches);
    useEffect(() => {
        const mq = matchMedia(query);
        const on = () => setNarrow(mq.matches);
        mq.addEventListener('change', on);
        return () => mq.removeEventListener('change', on);
    }, [query]);
    return narrow;
}
/** Phones: one window at a time. */
const useNarrow = () => useMedia('(max-width: 760px)');
/** Tablets and small laptops: windows side by side, but the doc list and pins slide over them. */
const useCompact = () => useMedia('(max-width: 1180px)');
export function App() {
    const docs = useDocs();
    const [layout, setLayout] = useState(loadLayout);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [toastMsg, setToastMsg] = useState(null);
    useEffect(() => {
        let t;
        const on = (e) => {
            setToastMsg(e.detail);
            clearTimeout(t);
            t = setTimeout(() => setToastMsg(null), 3500);
        };
        window.addEventListener('pp-toast', on);
        return () => {
            window.removeEventListener('pp-toast', on);
            clearTimeout(t);
        };
    }, []);
    const narrow = useNarrow();
    const compact = useCompact();
    // Tablets and small laptops fit two windows; bigger screens three.
    const maxPanes = compact ? 2 : MAX_PANES;
    const [sidebarOverlay, setSidebarOverlay] = useState(false);
    const panesRef = useRef(null);
    const acct = useAccount();
    const roundMode = useRoundMode();
    const [findOpen, setFindOpen] = useState(false);
    const [pinsOpen, setPinsOpen] = useState(() => {
        try {
            return localStorage.getItem('pp-pins-open') === '1';
        }
        catch {
            return false;
        }
    });
    useEffect(() => {
        try {
            localStorage.setItem('pp-pins-open', pinsOpen ? '1' : '0');
        }
        catch {
            // ignore
        }
    }, [pinsOpen]);
    // The flow's pins column asks to open a block (it can't call jumpTo directly).
    useEffect(() => {
        const on = (e) => {
            const { docId, blockId } = e.detail;
            jumpRef.current(docId, blockId, true);
        };
        window.addEventListener('pp-jump', on);
        return () => window.removeEventListener('pp-jump', on);
    }, []);
    // Ctrl/Cmd+K opens the block finder.
    useEffect(() => {
        const on = (e) => {
            if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                setFindOpen(true);
            }
        };
        window.addEventListener('keydown', on);
        return () => window.removeEventListener('keydown', on);
    }, []);
    // Links: #invite=<code> joins a team, #doc=<id> opens a doc (needs access).
    // Otherwise, on a first visit, add the sample docs.
    useEffect(() => {
        const handleHash = async () => {
            const invite = /^#invite=([A-Za-z0-9_-]{6,40})$/.exec(location.hash);
            const shared = /^#(?:doc|join)=([A-Za-z0-9-]{8,64})$/.exec(location.hash);
            if (!invite && !shared)
                return false;
            await loadAccount();
            const a = getAccount();
            if (!a.user) {
                // Keep the link in the address; signing in comes back to it.
                toast(a.server ? 'Sign in (top right) to open this link.' : 'This link only works on the ParliPrepRoom website.');
                return true;
            }
            history.replaceState(null, '', location.pathname + location.search);
            if (invite) {
                try {
                    const t = await joinTeam(invite[1]);
                    toast(`You're on ${t.name}.`);
                }
                catch (e) {
                    toast(e.message);
                }
                return true;
            }
            const meta = await addSharedDoc(decodeURIComponent(shared[1]));
            if (!meta) {
                toast("You don't have access to that doc. Ask its owner or your coach.");
                return true;
            }
            setSpace(spaceOf(meta));
            openInFocused(meta.id);
            return true;
        };
        void (async () => {
            await loadAccount();
            // First sign-in on this device: put its docs on the server (under My own docs).
            if (getAccount().user)
                void uploadLocalDocs();
            if (await handleHash()) {
                try {
                    localStorage.setItem('pp-seeded', '1');
                    localStorage.setItem('pp-seeded-flow', '1');
                }
                catch {
                    // ignore
                }
                return;
            }
            const l = await seedFirstRun();
            if (l)
                setLayout(l);
        })();
        const onHash = () => void handleHash();
        window.addEventListener('hashchange', onHash);
        return () => window.removeEventListener('hashchange', onHash);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    // Keep the sidebar in step with the server (on switching teams, every 30 s, on returning to the tab).
    useEffect(() => {
        if (!acct.user)
            return;
        const refresh = () => void syncDocList(acct.space).catch(() => { });
        refresh();
        const t = setInterval(refresh, 30_000);
        window.addEventListener('focus', refresh);
        return () => {
            clearInterval(t);
            window.removeEventListener('focus', refresh);
        };
    }, [acct.user, acct.space]);
    // Report round-doc events (blocked pastes, round doc on/off, time away) to the server's record.
    useEffect(() => {
        setLogUploader(async (docId, events) => {
            const meta = (await listDocs()).find((d) => d.id === docId);
            if (!syncing() || !onServer(meta))
                return;
            const notable = events.filter((e) => e.k !== 'type' && e.k !== 'delete');
            if (notable.length)
                await postDocEvents(docId, notable).catch(() => { });
        });
    }, []);
    useEffect(() => {
        try {
            localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
        }
        catch {
            // ignore
        }
    }, [layout]);
    // Save a version when the tab is hidden or closed.
    useEffect(() => {
        const on = () => {
            if (document.visibilityState === 'hidden')
                void flushAutoVersions();
        };
        document.addEventListener('visibilitychange', on);
        return () => document.removeEventListener('visibilitychange', on);
    }, []);
    const setPane = (i, p) => setLayout((l) => ({ ...l, panes: l.panes.map((x, j) => (j === i ? p : x)) }));
    const openInFocused = (docId) => {
        setLayout((l) => {
            const i = Math.min(l.focused, l.panes.length - 1);
            return { ...l, panes: l.panes.map((x, j) => (j === i ? { ...x, docId } : x)) };
        });
        setSidebarOverlay(false);
    };
    const addPane = () => setLayout((l) => {
        if (l.panes.length >= maxPanes)
            return l;
        return {
            ...l,
            panes: [...l.panes, { key: paneKey(), docId: null, outline: false }],
            weights: [...l.weights, 1],
            focused: l.panes.length,
        };
    });
    const closePane = (i) => setLayout((l) => {
        if (l.panes.length <= 1)
            return l;
        const panes = l.panes.filter((_, j) => j !== i);
        const weights = l.weights.filter((_, j) => j !== i);
        return { ...l, panes, weights, focused: Math.min(l.focused, panes.length - 1) };
    });
    const create = async (kind, paneIndex) => {
        const meta = await makeDoc(kind === 'prep' ? 'Untitled prep' : 'Untitled reference', kind, STARTER_LINES);
        if (paneIndex === undefined)
            openInFocused(meta.id);
        else
            setLayout((l) => ({ ...l, panes: l.panes.map((x, j) => (j === paneIndex ? { ...x, docId: meta.id } : x)) }));
    };
    // Import a file into a new reference doc (never into a round doc).
    const importReference = async (file) => {
        try {
            const { importFile } = await import('../import/importFile');
            const { title, json } = await importFile(file);
            const meta = await createDoc({ title, kind: 'reference' });
            const { doc, ready } = acquireDoc(meta.id);
            await ready;
            writeJSON(doc, json);
            releaseDoc(meta.id);
            openInFocused(meta.id);
            toast(`Imported “${title}” as a reference doc.`);
        }
        catch (e) {
            toast(e.message);
        }
    };
    const remove = async (doc) => {
        try {
            await deleteDoc(doc.id);
        }
        catch (e) {
            toast(e.message);
            return;
        }
        setLayout((l) => ({ ...l, panes: l.panes.map((p) => (p.docId === doc.id ? { ...p, docId: null } : p)) }));
        await destroyDocData(doc.id);
        await deleteAllVersions(doc.id);
    };
    // Drag the divider between two panes to resize them.
    const startResize = useCallback((i, e) => {
        const container = panesRef.current;
        if (!container)
            return;
        const els = Array.from(container.querySelectorAll(':scope > .pane-slot'));
        const a = els[i];
        const b = els[i + 1];
        if (!a || !b)
            return;
        e.preventDefault();
        const startX = e.clientX;
        const wa = a.getBoundingClientRect().width;
        const wb = b.getBoundingClientRect().width;
        const target = e.currentTarget;
        target.setPointerCapture(e.pointerId);
        const min = 280;
        const move = (ev) => {
            const dx = Math.max(min - wa, Math.min(wb - min, ev.clientX - startX));
            setLayout((l) => {
                const total = l.weights[i] + l.weights[i + 1];
                const weights = [...l.weights];
                weights[i] = (total * (wa + dx)) / (wa + wb);
                weights[i + 1] = total - weights[i];
                return { ...l, weights };
            });
        };
        const up = () => {
            target.removeEventListener('pointermove', move);
            target.removeEventListener('pointerup', up);
            target.removeEventListener('pointercancel', up);
        };
        target.addEventListener('pointermove', move);
        target.addEventListener('pointerup', up);
        target.addEventListener('pointercancel', up);
    }, []);
    const overlaySidebar = narrow || compact;
    const showSidebar = overlaySidebar ? sidebarOverlay : layout.sidebar;
    const signedIn = acct.server && !!acct.user;
    const spaceDocs = docs ? (signedIn ? docs.filter((d) => spaceOf(d) === acct.space) : docs) : null;
    // In Round Mode only round docs are listed (and searchable).
    const visibleDocs = spaceDocs ? (roundMode ? spaceDocs.filter((d) => d.round) : spaceDocs) : null;
    const spaceName = signedIn ? (acct.teams.find((t) => t.id === acct.space)?.name ?? 'My own docs') : null;
    const searchable = visibleDocs ?? [];
    const { index: library, blockContent } = useLibrary(searchable.map((d) => d.id), findOpen || pinsOpen);
    /** Open a doc at a block. keepFocused: don't replace the pane you're in (e.g. the flow); use another pane or open one. */
    const jumpTo = (docId, blockId, keepFocused = false) => {
        setLayout((l) => {
            const n = Date.now();
            const focus = { blockId, n };
            const existing = l.panes.findIndex((p) => p.docId === docId);
            let i = existing >= 0 ? existing : Math.min(l.focused, l.panes.length - 1);
            if (existing < 0 && keepFocused) {
                const other = l.panes.findIndex((_, j) => j !== l.focused);
                if (other >= 0)
                    i = other;
                else if (l.panes.length < MAX_PANES) {
                    return {
                        ...l,
                        panes: [...l.panes, { key: paneKey(), docId, outline: false, focus }],
                        weights: [...l.weights, 1],
                        focused: l.panes.length,
                    };
                }
            }
            return { ...l, focused: i, panes: l.panes.map((x, j) => (j === i ? { ...x, docId, focus } : x)) };
        });
        setSidebarOverlay(false);
    };
    // Inserting a prepped block: a copy, so it's only allowed outside Round
    // Mode and never into a round doc (that would be pasting into prep).
    const editors = useRef(new Map());
    // Re-render when a pane's editor appears, so the pin board can follow it.
    const [editorTick, setEditorTick] = useState(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const allEditors = useMemo(() => [...editors.current.values()], [editorTick]);
    const focusedPane = layout.panes[Math.min(layout.focused, layout.panes.length - 1)];
    const focusedMeta = docs?.find((d) => d.id === focusedPane?.docId) ?? null;
    const focusedEditor = focusedPane ? editors.current.get(focusedPane.key) ?? null : null;
    const insertBlocked = roundMode
        ? 'Turn off Round Mode to insert blocks.'
        : !focusedMeta
            ? 'Click into the doc you want to insert into first.'
            : focusedMeta.round
                ? "Blocks can't be inserted into a round doc: that would be pasting into prep. Type it in."
                : null;
    const insertBlock = (docId, blockId) => {
        if (insertBlocked) {
            toast(insertBlocked);
            return;
        }
        const editor = editors.current.get(focusedPane.key);
        const nodes = blockContent(docId, blockId);
        if (!editor || !nodes.length) {
            toast(editor ? 'That block is still loading. Try again in a moment.' : 'Click into the doc you want to insert into first.');
            return;
        }
        // In a flow, the copy goes in the column the caret is in.
        let speech = null;
        const flow = flowKey.getState(editor.state);
        const sheet = flow ? activeSheet(flow) : null;
        const { $from } = editor.state.selection;
        if (sheet && $from.depth >= 1) {
            const p = sheet.placements.find((x) => x.pos === $from.before(1));
            if (p && p.speech && p.speech !== baseSpeech(sheet.side))
                speech = p.speech;
        }
        const copies = nodes.map((n) => ({ ...n, attrs: { ...(n.attrs ?? {}), id: null, newRow: false, gap: 0, side: n.attrs?.kind === 'position' ? n.attrs?.side ?? null : null, speech } }));
        const at = $from.depth >= 1 ? $from.after(1) : editor.state.doc.content.size;
        editor.chain().focus().insertContentAt(at, copies).run();
        toast(`Inserted into “${focusedMeta.title}”.`);
    };
    const jumpRef = useRef(jumpTo);
    jumpRef.current = jumpTo;
    // The timer follows the round doc on screen (shared with the partner), else it's per device.
    const roundIdOf = (id) => (id && docs?.find((d) => d.id === id)?.round ? id : null);
    const timerDocId = roundIdOf(focusedPane?.docId) ?? layout.panes.map((p) => roundIdOf(p.docId)).find(Boolean) ?? null;
    const [newRoundOpen, setNewRoundOpen] = useState(false);
    /** After "New round": the doc on the left, the same doc as a flow on the right. */
    const openNewRound = (docId) => setLayout((l) => {
        const n = Date.now();
        const left = { key: l.panes[0]?.key ?? paneKey(), docId, outline: false, view: 'doc', focus: undefined };
        const right = { key: l.panes[1]?.key ?? paneKey(), docId, outline: false, view: 'flow', focus: undefined };
        void n;
        if (narrow || maxPanes < 2)
            return { ...l, panes: [left], weights: [1], focused: 0 };
        return { ...l, panes: [left, right], weights: [1, 1.3], focused: 0 };
    });
    const toggleRoundMode = () => setRoundMode(!roundMode, (spaceDocs ?? []).filter((d) => d.round).map((d) => d.id));
    const openIds = new Set(layout.panes.map((p) => p.docId).filter((x) => !!x));
    return (_jsxs("div", { className: 'app' + (narrow ? ' is-narrow' : compact ? ' is-compact' : '') + (roundMode ? ' is-round-mode' : ''), children: [_jsxs("header", { className: "topbar", children: [_jsx("button", { type: "button", className: "icon-btn", "aria-label": "Toggle document list", title: "Documents", onClick: () => (overlaySidebar ? setSidebarOverlay((s) => !s) : setLayout((l) => ({ ...l, sidebar: !l.sidebar }))), children: _jsx(IconMenu, {}) }), _jsxs("div", { className: "brand", children: [_jsx("img", { src: `${import.meta.env.BASE_URL}icon.svg`, alt: "", width: 22, height: 22 }), _jsx("span", { children: "ParliPrepRoom" })] }), narrow && layout.panes.length > 1 && (_jsx("div", { className: "seg pane-tabs", role: "tablist", "aria-label": "Panes", children: layout.panes.map((p, i) => (_jsx("button", { type: "button", role: "tab", "aria-selected": i === layout.focused, className: i === layout.focused ? 'is-on' : '', onClick: () => setLayout((l) => ({ ...l, focused: i })), children: docs?.find((d) => d.id === p.docId)?.title ?? 'Empty' }, p.key))) })), _jsx("span", { className: "tb-spacer" }), _jsxs("button", { type: "button", className: "btn ghost", onClick: addPane, disabled: layout.panes.length >= maxPanes, title: "Add a pane to show another document side by side", children: [_jsx(IconSplit, {}), " ", _jsx("span", { className: "hide-narrow", children: "Split view" })] }), _jsx(TimerHost, { docId: timerDocId }), acct.user && (_jsxs("button", { type: "button", className: "btn ghost new-round-btn", onClick: () => setNewRoundOpen(true), title: "Start a round: round doc for you and your partner, prep timer, tournament", children: [_jsx("span", { className: "hide-narrow", children: "New round" }), _jsx("span", { className: "show-narrow", "aria-hidden": "true", children: "+ Round" })] })), _jsx("button", { type: "button", className: "icon-btn", "aria-label": "Search blocks", title: "Find a block (Ctrl+K / \u2318K)", onClick: () => setFindOpen(true), children: _jsx(IconSearch, {}) }), _jsx("button", { type: "button", className: 'icon-btn' + (pinsOpen ? ' is-on' : ''), "aria-label": "Pinned blocks", "aria-pressed": pinsOpen, title: "Pinned blocks for your speech", onClick: () => setPinsOpen((o) => !o), children: _jsx(IconPin, {}) }), _jsxs("button", { type: "button", className: 'round-mode-btn' + (roundMode ? ' is-on' : ''), "aria-pressed": roundMode, title: roundMode ? 'Leave Round Mode' : 'Round Mode: only round docs can be open during the round', onClick: toggleRoundMode, children: [_jsx("span", { className: "switch" }), " ", _jsx("span", { className: "hide-narrow", children: "Round Mode" })] }), _jsx(AccountBar, { onOpenDoc: (id) => void addSharedDoc(id).then((m) => {
                            if (m)
                                openInFocused(m.id);
                        }) }), _jsx("button", { type: "button", className: "icon-btn", "aria-label": "Appearance", title: "Fonts and theme", onClick: () => setSettingsOpen(true), children: _jsx(IconSettings, {}) })] }), _jsxs("div", { className: "workspace", children: [showSidebar && docs && (_jsxs(_Fragment, { children: [overlaySidebar && _jsx("div", { className: "scrim", onClick: () => setSidebarOverlay(false) }), _jsx(Sidebar, { docs: visibleDocs, spaceName: spaceName, signedOutOnServer: acct.server && acct.loaded && !acct.user, openIds: openIds, onOpen: openInFocused, onCreate: (k) => void create(k), onDelete: (d) => void remove(d), onImport: roundMode ? undefined : (f) => void importReference(f) })] })), _jsx("div", { className: "panes", ref: panesRef, children: docs &&
                            layout.panes.map((p, i) => (_jsxs(Fragment, { children: [i > 0 && !narrow && (_jsx("div", { className: "resizer", role: "separator", "aria-orientation": "vertical", "aria-label": "Resize panes", onPointerDown: (e) => startResize(i - 1, e) })), _jsx("div", { className: "pane-slot", style: { flexGrow: layout.weights[i] ?? 1 }, hidden: narrow && i !== layout.focused, children: _jsx(Pane, { pane: p, docs: docs, focused: i === layout.focused && layout.panes.length > 1, canClose: layout.panes.length > 1, alsoOpen: !!p.docId && layout.panes.filter((x) => x.docId === p.docId).length > 1, space: acct.space, roundMode: roundMode, onEditorChange: (e) => {
                                                if (e)
                                                    editors.current.set(p.key, e);
                                                else
                                                    editors.current.delete(p.key);
                                                setEditorTick((t) => t + 1);
                                            }, onFocus: () => layout.focused !== i && setLayout((l) => ({ ...l, focused: i })), onChange: (np) => setPane(i, np), onClose: () => closePane(i), onCreate: (k) => void create(k, i) }) })] }, p.key))) }), pinsOpen && (_jsx(PinBoard, { space: acct.space, docs: searchable, index: library, followEditor: focusedEditor, allEditors: allEditors, onJump: jumpTo, onInsert: insertBlock, insertBlocked: insertBlocked, onClose: () => setPinsOpen(false) }))] }), newRoundOpen && _jsx(NewRoundDialog, { onCreated: openNewRound, onClose: () => setNewRoundOpen(false) }), findOpen && (_jsx(BlockFinder, { docs: searchable, index: library, space: acct.space, roundMode: roundMode, onJump: jumpTo, onInsert: insertBlock, insertBlocked: insertBlocked, onClose: () => setFindOpen(false) })), settingsOpen && _jsx(SettingsDialog, { onClose: () => setSettingsOpen(false) }), acct.loaded && !acct.server && _jsx(NameDialog, {}), _jsx("div", { className: "toast", role: "status", "aria-live": "polite", hidden: !toastMsg, children: toastMsg })] }));
}
/** Opens the round doc (if any) so the timer can be shared through it. */
function TimerHost({ docId }) {
    const opened = useYDoc(docId);
    return _jsx(Timer, { doc: docId ? opened?.doc ?? null : null }, docId ?? 'local');
}
