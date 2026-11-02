import type { JSONContent } from '@tiptap/core';
import type { Editor } from '@tiptap/react';
import { yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import { useEffect, useMemo, useState } from 'react';
import type * as Y from 'yjs';
import { BODY_FIELD } from '../editor/extensions';
import { diffBlocks, flattenDoc, summarize, type DiffRow, type FlatBlock } from '../history/diff';
import { loadVersionDoc, renameVersion, saveVersion, type VersionMeta } from '../store/versions';
import { useVersions } from './hooks';

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

function Line({ block, children, className }: { block: FlatBlock; children?: React.ReactNode; className?: string }) {
  return (
    <div className={'pp-block ' + (className ?? '')} data-kind={block.kind}>
      {children ?? (block.text || ' ')}
    </div>
  );
}

function DiffLines({ rows, changesOnly }: { rows: DiffRow[]; changesOnly: boolean }) {
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

export function HistoryView({
  docId,
  ydoc,
  editor,
  onClose,
}: {
  docId: string;
  ydoc: Y.Doc;
  editor: Editor | null;
  onClose: () => void;
}) {
  const versions = useVersions(docId);
  const [selected, setSelected] = useState<string | null>(null);
  const [versionJson, setVersionJson] = useState<JSONContent | null>(null);
  const [currentJson, setCurrentJson] = useState<JSONContent | null>(() => editor?.getJSON() ?? null);
  const [mode, setMode] = useState<'compare' | 'read'>('compare');
  const [changesOnly, setChangesOnly] = useState(false);
  const [naming, setNaming] = useState('');

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
    if (!selected) return;
    void loadVersionDoc(selected).then((vdoc) => {
      if (!live || !vdoc) return;
      setVersionJson(yXmlFragmentToProsemirrorJSON(vdoc.getXmlFragment(BODY_FIELD)) as JSONContent);
      vdoc.destroy();
    });
    return () => {
      live = false;
    };
  }, [selected]);

  const rows = useMemo(
    () => (versionJson && currentJson ? diffBlocks(flattenDoc(versionJson), flattenDoc(currentJson)) : []),
    [versionJson, currentJson],
  );
  const stats = summarize(rows);
  const noChanges = stats.added + stats.removed + stats.changed === 0;

  const saveNamed = async () => {
    await saveVersion(docId, ydoc, { auto: false, name: naming || 'Saved version' });
    setNaming('');
  };

  const restore = async () => {
    if (!editor || !versionJson || !selectedMeta) return;
    const when = `${formatDay(selectedMeta.at)} ${formatTime(selectedMeta.at)}`;
    if (!window.confirm(`Restore the version from ${when}? The current text is saved as a version first, so you can undo this.`)) return;
    await saveVersion(docId, ydoc, { auto: false, name: `Before restoring ${when}` });
    editor.commands.setContent(versionJson);
    onClose();
  };

  const rename = async (v: VersionMeta) => {
    const name = window.prompt('Name this version', v.name ?? '');
    if (name !== null) await renameVersion(docId, v.id, name);
  };

  let lastDay = '';

  return (
    <div className="history">
      <div className="history-main">
        <div className="history-bar">
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
          <button type="button" className="btn primary" disabled={!versionJson} onClick={restore}>
            Restore this version
          </button>
        </div>
        {mode === 'compare' && selectedMeta && versionJson && (
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
          {versionJson && mode === 'read' && flattenDoc(versionJson).map((b, i) => <Line key={i} block={b} />)}
          {versionJson && mode === 'compare' && <DiffLines rows={rows} changesOnly={changesOnly} />}
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
                  <button
                    type="button"
                    className={'version' + (v.id === selected ? ' is-on' : '') + (v.name ? ' named' : '')}
                    onClick={() => setSelected(v.id)}
                    onDoubleClick={() => void rename(v)}
                  >
                    <span className="v-name">{versionLabel(v)}</span>
                    <span className="v-time">{formatTime(v.at)}</span>
                  </button>
                </li>
              </FragmentRow>
            );
          })}
        </ul>
        {selectedMeta && (
          <button type="button" className="btn ghost small" onClick={() => void rename(selectedMeta)}>
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
