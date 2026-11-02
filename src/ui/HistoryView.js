import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import { useEffect, useMemo, useState } from 'react';
import { BODY_FIELD } from '../editor/extensions';
import { diffBlocks, flattenDoc, summarize } from '../history/diff';
import { loadVersionDoc, renameVersion, saveVersion } from '../store/versions';
import { logEvent } from '../store/typingLog';
import { useVersions } from './hooks';
import { ServerHistory } from './ServerHistory';
import { TypingLogView } from './TypingLogView';
function formatTime(at) {
    return new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
function formatDay(at) {
    const d = new Date(at);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString())
        return 'Today';
    if (d.toDateString() === yesterday.toDateString())
        return 'Yesterday';
    return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}
function versionLabel(v) {
    return v.name ?? 'Auto-save';
}
export function Line({ block, children, className }) {
    return (_jsx("div", { className: 'pp-block ' + (className ?? ''), "data-kind": block.kind, children: children ?? (block.text || ' ') }));
}
export function DiffLines({ rows, changesOnly }) {
    return (_jsx(_Fragment, { children: rows.map((r, i) => {
            if (r.type !== 'changed') {
                if (r.type === 'same')
                    return changesOnly ? null : _jsx(Line, { block: r.block }, i);
                return _jsx(Line, { block: r.block, className: r.type === 'added' ? 'diff-added' : 'diff-removed' }, i);
            }
            return (_jsxs(Line, { block: r.to, className: "diff-changed", children: [r.from.kind !== r.to.kind && _jsxs("span", { className: "diff-kind", children: ["was ", r.from.kind] }), r.parts.map((p, j) => p.added ? (_jsx("ins", { children: p.value }, j)) : p.removed ? (_jsx("del", { children: p.value }, j)) : (_jsx("span", { children: p.value }, j)))] }, i));
        }) }));
}
export function HistoryView({ docId, ydoc, editor, round = false, checkToken, server = false, onClose, }) {
    const [tab, setTab] = useState(server ? 'history' : 'device');
    const tabs = _jsx(HistoryTabs, { tab: tab, setTab: setTab, server: server });
    if (tab === 'history' || tab === 'replay') {
        return _jsx(ServerHistory, { mode: tab, docId: docId, editor: editor, round: round, tabs: tabs, onClose: onClose }, tab);
    }
    if (tab === 'log') {
        return (_jsx("div", { className: "history", children: _jsxs("div", { className: "history-main", children: [_jsxs("div", { className: "history-bar", children: [tabs, _jsx("span", { className: "tb-spacer" }), _jsx("button", { type: "button", className: "btn ghost", onClick: onClose, children: "Done" })] }), _jsx(TypingLogView, { docId: docId, checkToken: checkToken })] }) }));
    }
    return _jsx(VersionsView, { docId: docId, ydoc: ydoc, editor: editor, round: round, onClose: onClose, tabs: tabs });
}
function HistoryTabs({ tab, setTab, server }) {
    const b = (t, label, title) => (_jsx("button", { type: "button", className: tab === t ? 'is-on' : '', onClick: () => setTab(t), title: title, children: label }));
    return (_jsxs("div", { className: "seg", role: "group", "aria-label": "History", children: [server && b('history', 'History', 'Every edit by everyone, from the server, with names'), server && b('replay', 'Replay', 'Watch the doc being written, edit by edit'), b('device', server ? 'Saved here' : 'Versions', 'Versions saved on this device'), b('log', 'Typing log', 'Typing done on this device')] }));
}
function VersionsView({ docId, ydoc, editor, round, onClose, tabs, }) {
    const versions = useVersions(docId);
    const [selected, setSelected] = useState(null);
    const [versionJson, setVersionJson] = useState(null);
    const [currentJson, setCurrentJson] = useState(() => editor?.getJSON() ?? null);
    const [mode, setMode] = useState('compare');
    const [changesOnly, setChangesOnly] = useState(false);
    const [naming, setNaming] = useState('');
    const [confirmRestore, setConfirmRestore] = useState(false);
    const [renaming, setRenaming] = useState(null);
    const selectedMeta = versions?.find((v) => v.id === selected) ?? null;
    useEffect(() => {
        if (!selected && versions?.length)
            setSelected(versions[0].id);
    }, [versions, selected]);
    useEffect(() => {
        if (!editor)
            return;
        const update = () => setCurrentJson(editor.getJSON());
        update();
        editor.on('update', update);
        return () => {
            editor.off('update', update);
        };
    }, [editor]);
    useEffect(() => {
        let live = true;
        setVersionJson(null);
        setConfirmRestore(false);
        if (!selected)
            return;
        void loadVersionDoc(selected).then((vdoc) => {
            if (!live || !vdoc)
                return;
            setVersionJson(yXmlFragmentToProsemirrorJSON(vdoc.getXmlFragment(BODY_FIELD)));
            vdoc.destroy();
        });
        return () => {
            live = false;
        };
    }, [selected]);
    const rows = useMemo(() => (versionJson && currentJson ? diffBlocks(flattenDoc(versionJson), flattenDoc(currentJson)) : []), [versionJson, currentJson]);
    const stats = summarize(rows);
    const noChanges = stats.added + stats.removed + stats.changed === 0;
    const saveNamed = async () => {
        await saveVersion(docId, ydoc, { auto: false, name: naming || 'Saved version' });
        setNaming('');
    };
    const restore = async () => {
        if (!editor || !versionJson || !selectedMeta)
            return;
        const when = `${formatDay(selectedMeta.at)} ${formatTime(selectedMeta.at)}`;
        await saveVersion(docId, ydoc, { auto: false, name: `Before restoring ${when}` });
        if (round)
            logEvent(docId, { k: 'restore', s: when });
        editor.commands.setContent(versionJson);
        onClose();
    };
    const commitRename = async (v, name) => {
        setRenaming(null);
        if (name.trim() !== (v.name ?? ''))
            await renameVersion(docId, v.id, name);
    };
    let lastDay = '';
    return (_jsxs("div", { className: "history", children: [_jsxs("div", { className: "history-main", children: [_jsxs("div", { className: "history-bar", children: [tabs, _jsxs("div", { className: "seg", role: "group", "aria-label": "View", children: [_jsx("button", { type: "button", className: mode === 'compare' ? 'is-on' : '', onClick: () => setMode('compare'), children: "Changes since" }), _jsx("button", { type: "button", className: mode === 'read' ? 'is-on' : '', onClick: () => setMode('read'), children: "This version" })] }), mode === 'compare' && (_jsxs("label", { className: "check", children: [_jsx("input", { type: "checkbox", checked: changesOnly, onChange: (e) => setChangesOnly(e.target.checked) }), " Changes only"] })), _jsx("span", { className: "tb-spacer" }), confirmRestore ? (_jsxs("span", { className: "confirm", children: [_jsx("span", { className: "confirm-text", children: "Current text is saved as a version first." }), _jsx("button", { type: "button", className: "btn ghost", onClick: () => setConfirmRestore(false), children: "Cancel" }), _jsx("button", { type: "button", className: "btn primary", onClick: () => void restore(), children: "Restore" })] })) : (_jsx("button", { type: "button", className: "btn primary", disabled: !versionJson, onClick: () => setConfirmRestore(true), children: "Restore this version" }))] }), mode === 'compare' && selectedMeta && versionJson && (_jsxs("p", { className: "history-summary", children: [noChanges
                                ? 'No changes since this version.'
                                : `Since ${formatDay(selectedMeta.at).toLowerCase()} at ${formatTime(selectedMeta.at)}: ${stats.added} added, ${stats.changed} edited, ${stats.removed} removed.`, _jsxs("span", { className: "legend", children: [_jsx("ins", { children: "added" }), " ", _jsx("del", { children: "removed" })] })] })), _jsxs("div", { className: "pp-doc history-doc", children: [!versions?.length && _jsx("p", { className: "muted", children: "No versions yet. Versions save automatically every couple of minutes while you edit, or name one on the right." }), versionJson && mode === 'read' && flattenDoc(versionJson).map((b, i) => _jsx(Line, { block: b }, i)), versionJson && mode === 'compare' && _jsx(DiffLines, { rows: rows, changesOnly: changesOnly })] })] }), _jsxs("aside", { className: "history-list", "aria-label": "Versions", children: [_jsxs("div", { className: "history-list-head", children: [_jsx("strong", { children: "Version history" }), _jsx("button", { type: "button", className: "btn ghost", onClick: onClose, children: "Done" })] }), _jsxs("form", { className: "name-now", onSubmit: (e) => {
                            e.preventDefault();
                            void saveNamed();
                        }, children: [_jsx("input", { value: naming, onChange: (e) => setNaming(e.target.value), placeholder: "Name current version\u2026", "aria-label": "Version name" }), _jsx("button", { type: "submit", className: "btn", children: "Save" })] }), _jsx("ul", { children: versions?.map((v) => {
                            const day = formatDay(v.at);
                            const header = day !== lastDay ? _jsx("li", { className: "day", children: day }) : null;
                            lastDay = day;
                            return (_jsx(FragmentRow, { header: header, children: _jsx("li", { children: renaming === v.id ? (_jsx("input", { className: "v-rename", autoFocus: true, defaultValue: v.name ?? '', placeholder: "Version name", "aria-label": "Version name", onBlur: (e) => void commitRename(v, e.target.value), onKeyDown: (e) => {
                                            if (e.key === 'Enter')
                                                e.target.blur();
                                            if (e.key === 'Escape')
                                                setRenaming(null);
                                        } })) : (_jsxs("button", { type: "button", className: 'version' + (v.id === selected ? ' is-on' : '') + (v.name ? ' named' : ''), onClick: () => setSelected(v.id), onDoubleClick: () => setRenaming(v.id), children: [_jsx("span", { className: "v-name", children: versionLabel(v) }), _jsx("span", { className: "v-time", children: formatTime(v.at) })] })) }) }, v.id));
                        }) }), selectedMeta && (_jsx("button", { type: "button", className: "btn ghost small", onClick: () => setRenaming(selectedMeta.id), children: selectedMeta.name ? 'Rename version' : 'Name this version' }))] })] }));
}
function FragmentRow({ header, children }) {
    return (_jsxs(_Fragment, { children: [header, children] }));
}
