import { ROUND_NO_RESTORE, toast } from '../editor/roundGuard';
import type { JSONContent } from '@tiptap/core';
import type { Editor } from '@tiptap/react';
import { yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import { useEffect, useMemo, useState } from 'react';
import type * as Y from 'yjs';
import { BODY_FIELD } from '../editor/extensions';
import { diffBlocks, flattenDoc, summarize, type DiffRow, type FlatBlock } from '../history/diff';
import { diffFlows, flattenFlow, summarizeFlow } from '../history/flowDiff';
import { restoreFlow } from '../flow2/restore';
import type { FlowSheetData } from '../flow2/model';
import { readFlow } from '../flow2/model';
import { loadVersionDoc, renameVersion, saveVersion, type VersionMeta } from '../store/versions';
import { FlowDiffLines, FlowSnapshotView, useFlowSheets } from './FlowHistory';
import { logEvent } from '../store/typingLog';
import { useVersions } from './hooks';
import { ServerHistory } from './ServerHistory';
import { TypingLogView } from './TypingLogView';

function formatTime(at: number) {
  return new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatDay(at: number) {
  const d = new Date(at);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

function versionLabel(v: VersionMeta) {
  return v.name ?? 'Auto-save';
}

export function Line({ block, children, className }: { block: FlatBlock; children?: React.ReactNode; className?: string }) {
  return (
    <div className={'pp-block ' + (className ?? '')} data-kind={block.kind}>
      {children ?? (block.text || ' ')}
    </div>
  );
}

export function DiffLines({ rows, changesOnly }: { rows: DiffRow[]; changesOnly: boolean }) {
  return (
    <>
      {rows.map((r, i) => {
        if (r.type !== 'changed') {
          if (r.type === 'same') return changesOnly ? null : <Line key={i} block={r.block} />;
          return <Line key={i} block={r.block} className={r.type === 'added' ? 'diff-added' : 'diff-removed'} />;
        }
        return (
          <Line key={i} block={r.to} className="diff-changed">
            {r.from.kind !== r.to.kind && <span className="diff-kind">was {r.from.kind}</span>}
            {r.parts.map((p, j) =>
              p.added ? (
                <ins key={j}>{p.value}</ins>
              ) : p.removed ? (
                <del key={j}>{p.value}</del>
              ) : (
                <span key={j}>{p.value}</span>
              ),
            )}
          </Line>
        );
      })}
    </>
  );
}

type Tab = 'history' | 'replay' | 'device' | 'log';

export function HistoryView({
  docId,
  ydoc,
  editor,
  round = false,
  checkToken,
  server = false,
  format = 'doc',
  onClose,
}: {
  docId: string;
  ydoc: Y.Doc;
  editor: Editor | null;
  /** A doc is compared block by block, a flow cell by cell. */
  format?: 'doc' | 'flow';
  round?: boolean;
  checkToken?: string | null;
  /** The doc is on the server: history and replay come from the server's record (everyone's edits, with names). */
  server?: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>(server ? 'history' : 'device');
  const tabs = <HistoryTabs tab={tab} setTab={setTab} server={server} />;
  if (tab === 'history' || tab === 'replay') {
    return <ServerHistory key={tab} mode={tab} docId={docId} ydoc={ydoc} format={format} editor={editor} round={round} tabs={tabs} onClose={onClose} />;
  }
  if (tab === 'log') {
    return (
      <div className="history">
        <div className="history-main">
          <div className="history-bar">
            {tabs}
            <span className="tb-spacer" />
            <button type="button" className="btn ghost" onClick={onClose}>
              Done
            </button>
          </div>
          <TypingLogView docId={docId} checkToken={checkToken} />
        </div>
      </div>
    );
  }
  return <VersionsView docId={docId} ydoc={ydoc} format={format} editor={editor} round={round} onClose={onClose} tabs={tabs} />;
}

function HistoryTabs({ tab, setTab, server }: { tab: Tab; setTab: (t: Tab) => void; server: boolean }) {
  const b = (t: Tab, label: string, title?: string) => (
    <button type="button" className={tab === t ? 'is-on' : ''} onClick={() => setTab(t)} title={title}>
      {label}
    </button>
  );
  return (
    <div className="seg" role="group" aria-label="History">
      {server && b('history', 'History', 'Every edit by everyone, from the server, with names')}
      {server && b('replay', 'Replay', 'Watch the doc being written, edit by edit')}
      {b('device', server ? 'Saved here' : 'Versions', 'Versions saved on this device')}
      {b('log', 'Typing log', 'Typing done on this device')}
    </div>
  );
}

function VersionsView({
  docId,
  ydoc,
  format,
  editor,
  round,
  onClose,
  tabs,
}: {
  docId: string;
  ydoc: Y.Doc;
  format: 'doc' | 'flow';
  editor: Editor | null;
  round: boolean;
  onClose: () => void;
  tabs: React.ReactNode;
}) {
  const versions = useVersions(docId);
  const [selected, setSelected] = useState<string | null>(null);
  const [versionJson, setVersionJson] = useState<JSONContent | null>(null);
  const [currentJson, setCurrentJson] = useState<JSONContent | null>(() => editor?.getJSON() ?? null);
  const flow = format === 'flow';
  const [versionSheets, setVersionSheets] = useState<FlowSheetData[] | null>(null);
  const currentSheets = useFlowSheets(ydoc, flow);
  const [mode, setMode] = useState<'compare' | 'read'>('compare');
  const [changesOnly, setChangesOnly] = useState(false);
  const [naming, setNaming] = useState('');
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);

  const selectedMeta = versions?.find((v) => v.id === selected) ?? null;

  useEffect(() => {
    if (!selected && versions?.length) setSelected(versions[0].id);
  }, [versions, selected]);

  useEffect(() => {
    if (!editor) return;
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
    setVersionSheets(null);
    setConfirmRestore(false);
    if (!selected) return;
    void loadVersionDoc(selected).then((vdoc) => {
      if (!live || !vdoc) return;
      if (flow) setVersionSheets(readFlow(vdoc));
      else setVersionJson(yXmlFragmentToProsemirrorJSON(vdoc.getXmlFragment(BODY_FIELD)) as JSONContent);
      vdoc.destroy();
    });
    return () => {
      live = false;
    };
  }, [selected, flow]);

  const flowRows = useMemo(() => (versionSheets && currentSheets ? diffFlows(flattenFlow(versionSheets), flattenFlow(currentSheets)) : []), [versionSheets, currentSheets]);
  const rows = useMemo(
    () => (versionJson && currentJson ? diffBlocks(flattenDoc(versionJson), flattenDoc(currentJson)) : []),
    [versionJson, currentJson],
  );
  const stats = flow ? summarizeFlow(flowRows) : summarize(rows);
  const haveVersion = flow ? !!versionSheets : !!versionJson;
  const noChanges = stats.added + stats.removed + stats.changed === 0;

  const saveNamed = async () => {
    await saveVersion(docId, ydoc, { auto: false, name: naming || 'Saved version' });
    setNaming('');
  };

  const restore = async () => {
    if (round) return toast(ROUND_NO_RESTORE);
    if (!selectedMeta || (flow ? !versionSheets : !editor || !versionJson)) return;
    const when = `${formatDay(selectedMeta.at)} ${formatTime(selectedMeta.at)}`;
    await saveVersion(docId, ydoc, { auto: false, name: `Before restoring ${when}` });
    if (round) logEvent(docId, { k: 'restore', s: when });
    if (flow) {
      const vdoc = await loadVersionDoc(selectedMeta.id);
      if (vdoc) {
        restoreFlow(ydoc, vdoc);
        vdoc.destroy();
      }
    } else editor!.commands.setContent(versionJson!);
    onClose();
  };

  const commitRename = async (v: VersionMeta, name: string) => {
    setRenaming(null);
    if (name.trim() !== (v.name ?? '')) await renameVersion(docId, v.id, name);
  };

  let lastDay = '';

  return (
    <div className="history">
      <div className="history-main">
        <div className="history-bar">
          {tabs}
          <div className="seg" role="group" aria-label="View">
            <button type="button" className={mode === 'compare' ? 'is-on' : ''} onClick={() => setMode('compare')}>
              Changes since
            </button>
            <button type="button" className={mode === 'read' ? 'is-on' : ''} onClick={() => setMode('read')}>
              This version
            </button>
          </div>
          {mode === 'compare' && (
            <label className="check">
              <input type="checkbox" checked={changesOnly} onChange={(e) => setChangesOnly(e.target.checked)} /> Changes only
            </label>
          )}
          <span className="tb-spacer" />
          {round && <span className="muted small">Restoring is off in a round doc.</span>}
          {confirmRestore ? (
            <span className="confirm">
              <span className="confirm-text">Current text is saved as a version first.</span>
              <button type="button" className="btn ghost" onClick={() => setConfirmRestore(false)}>
                Cancel
              </button>
              <button type="button" className="btn primary" onClick={() => void restore()}>
                Restore
              </button>
            </span>
          ) : (
            <button type="button" className="btn primary" disabled={!haveVersion || round} title={round ? ROUND_NO_RESTORE : undefined} onClick={() => setConfirmRestore(true)}>
              Restore this version
            </button>
          )}
        </div>
        {mode === 'compare' && selectedMeta && haveVersion && (
          <p className="history-summary">
            {noChanges
              ? 'No changes since this version.'
              : `Since ${formatDay(selectedMeta.at).toLowerCase()} at ${formatTime(selectedMeta.at)}: ${stats.added} added, ${stats.changed} edited, ${stats.removed} removed.`}
            <span className="legend">
              <ins>added</ins> <del>removed</del>
            </span>
          </p>
        )}
        <div className="pp-doc history-doc">
          {!versions?.length && <p className="muted">No versions yet. Versions save automatically every couple of minutes while you edit, or name one on the right.</p>}
          {!flow && versionJson && mode === 'read' && flattenDoc(versionJson).map((b, i) => <Line key={i} block={b} />)}
          {!flow && versionJson && mode === 'compare' && <DiffLines rows={rows} changesOnly={changesOnly} />}
          {flow && versionSheets && mode === 'read' && <FlowSnapshotView sheets={versionSheets} />}
          {flow && versionSheets && mode === 'compare' && <FlowDiffLines rows={flowRows} changesOnly={changesOnly} />}
        </div>
      </div>
      <aside className="history-list" aria-label="Versions">
        <div className="history-list-head">
          <strong>Version history</strong>
          <button type="button" className="btn ghost" onClick={onClose}>
            Done
          </button>
        </div>
        <form
          className="name-now"
          onSubmit={(e) => {
            e.preventDefault();
            void saveNamed();
          }}
        >
          <input value={naming} onChange={(e) => setNaming(e.target.value)} placeholder="Name current version…" aria-label="Version name" />
          <button type="submit" className="btn">
            Save
          </button>
        </form>
        <ul>
          {versions?.map((v) => {
            const day = formatDay(v.at);
            const header = day !== lastDay ? <li className="day">{day}</li> : null;
            lastDay = day;
            return (
              <FragmentRow key={v.id} header={header}>
                <li>
                  {renaming === v.id ? (
                    <input
                      className="v-rename"
                      autoFocus
                      defaultValue={v.name ?? ''}
                      placeholder="Version name"
                      aria-label="Version name"
                      onBlur={(e) => void commitRename(v, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                        if (e.key === 'Escape') setRenaming(null);
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className={'version' + (v.id === selected ? ' is-on' : '') + (v.name ? ' named' : '')}
                      onClick={() => setSelected(v.id)}
                      onDoubleClick={() => setRenaming(v.id)}
                    >
                      <span className="v-name">{versionLabel(v)}</span>
                      <span className="v-time">{formatTime(v.at)}</span>
                    </button>
                  )}
                </li>
              </FragmentRow>
            );
          })}
        </ul>
        {selectedMeta && (
          <button type="button" className="btn ghost small" onClick={() => setRenaming(selectedMeta.id)}>
            {selectedMeta.name ? 'Rename version' : 'Name this version'}
          </button>
        )}
      </aside>
    </div>
  );
}

function FragmentRow({ header, children }: { header: React.ReactNode; children: React.ReactNode }) {
  return (
    <>
      {header}
      {children}
    </>
  );
}
