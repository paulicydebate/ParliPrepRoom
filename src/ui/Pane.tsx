import type { Editor } from '@tiptap/react';
import { useCallback, useEffect, useState } from 'react';
import type * as Y from 'yjs';
import { toast } from '../editor/roundGuard';
import { renameDoc, type DocMeta } from '../store/docs';
import { setRound, useRound } from '../store/roundDoc';
import { DocEditor, Outline, Toolbar } from './DocEditor';
import { FlowEditor } from './FlowEditor';
import { HistoryView } from './HistoryView';
import { IconClose, IconDownload, IconHistory, IconLock, IconOutline, IconSwap } from './icons';
import { useYDoc } from './useYDoc';

export interface PaneState {
  key: string;
  docId: string | null;
  outline: boolean;
  view?: 'doc' | 'flow';
}

function ExportMenu({ editor, title }: { editor: Editor | null; title: string }) {
  const [busy, setBusy] = useState(false);
  const run = async (e: React.MouseEvent, kind: 'docx' | 'xlsx') => {
    (e.currentTarget.closest('details') as HTMLDetailsElement).open = false;
    if (!editor) return;
    setBusy(true);
    try {
      const { download, safeFilename } = await import('../export/runs');
      const name = safeFilename(title);
      if (kind === 'docx') {
        const { buildDocx } = await import('../export/docx');
        download(await buildDocx(editor.state.doc, title), `${name}.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      } else {
        const { buildFlowXlsx } = await import('../export/xlsx');
        download(new Uint8Array(buildFlowXlsx(editor.state.doc)), `${name} flow.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className="export-menu">
      <summary className="icon-btn" title="Export" aria-label="Export">
        <IconDownload />
      </summary>
      <div className="menu">
        <button type="button" disabled={busy} onClick={(e) => void run(e, 'docx')}>
          Word document (.docx)
        </button>
        <button type="button" disabled={busy} onClick={(e) => void run(e, 'xlsx')}>
          Excel flow (.xlsx)
        </button>
      </div>
    </details>
  );
}

/** Top-right switch that makes a doc a round doc (paste off, typing logged). */
function RoundToggle({ ydoc, docId, round }: { ydoc: Y.Doc; docId: string; round: boolean }) {
  const [confirmOff, setConfirmOff] = useState(false);
  useEffect(() => {
    if (!confirmOff) return;
    const t = setTimeout(() => setConfirmOff(false), 4000);
    return () => clearTimeout(t);
  }, [confirmOff]);
  if (!round) {
    return (
      <button
        type="button"
        className="round-toggle"
        title="Make this a round doc: paste and drag-and-drop are blocked and typing is logged"
        aria-pressed={false}
        onClick={() => {
          setRound(ydoc, docId, true);
          toast('Round doc on: paste is off and typing is logged.');
        }}
      >
        <span className="switch" /> Round doc
      </button>
    );
  }
  return (
    <button
      type="button"
      className={'round-toggle is-on' + (confirmOff ? ' confirm' : '')}
      aria-pressed={true}
      title="Round doc: paste is off and typing is logged"
      onClick={() => {
        if (!confirmOff) {
          setConfirmOff(true);
          return;
        }
        setConfirmOff(false);
        setRound(ydoc, docId, false);
        toast('Round doc off. This is recorded in the typing log.');
      }}
    >
      <span className="switch" /> {confirmOff ? 'Turn off? (logged)' : 'Round doc'}
    </button>
  );
}

function TitleInput({ meta }: { meta: DocMeta }) {
  const [value, setValue] = useState(meta.title);
  useEffect(() => setValue(meta.title), [meta.title]);
  const commit = () => {
    const t = value.trim();
    if (t && t !== meta.title) void renameDoc(meta.id, t);
    else setValue(meta.title);
  };
  return (
    <input
      className="title-input"
      value={value}
      aria-label="Document title"
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setValue(meta.title);
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

export function Pane({
  pane,
  docs,
  focused,
  canClose,
  alsoOpen = false,
  onFocus,
  onChange,
  onClose,
  onCreate,
}: {
  pane: PaneState;
  docs: DocMeta[];
  focused: boolean;
  canClose: boolean;
  alsoOpen?: boolean;
  onFocus: () => void;
  onChange: (p: PaneState) => void;
  onClose: () => void;
  onCreate: (kind: DocMeta['kind']) => void;
}) {
  const meta = docs.find((d) => d.id === pane.docId) ?? null;
  const ydoc = useYDoc(meta ? meta.id : null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [history, setHistory] = useState(false);
  const onEditor = useCallback((e: Editor | null) => setEditor(e), []);

  useEffect(() => setHistory(false), [pane.docId]);
  const view = pane.view ?? 'doc';
  const round = useRound(ydoc);

  return (
    <section
      className={'pane' + (focused ? ' is-focused' : '') + (round ? ' is-round' : '')}
      onPointerDownCapture={onFocus}
      onFocusCapture={onFocus}
      aria-label={meta ? meta.title : 'Empty pane'}
    >
      <header className="pane-head">
        {meta ? (
          <>
            {round ? (
              <span className="badge round" title="Round doc: paste is off and typing is logged">
                <IconLock /> Round doc
              </span>
            ) : (
              <span className={'badge ' + meta.kind}>{meta.kind === 'prep' ? 'Prep' : 'Reference'}</span>
            )}
            <TitleInput meta={meta} />
            {alsoOpen && (
              <span className="linked-chip" title="This document is open in another pane too. Both panes show the same text; editing one edits the other.">
                Same doc as other pane
              </span>
            )}
          </>
        ) : (
          <span className="pane-empty-title">Open a document</span>
        )}
        <span className="tb-spacer" />
        {meta && (
          <div className="seg view-toggle" role="group" aria-label="View">
            <button type="button" className={view === 'doc' ? 'is-on' : ''} aria-pressed={view === 'doc'} onClick={() => onChange({ ...pane, view: 'doc' })}>
              Doc
            </button>
            <button type="button" className={view === 'flow' ? 'is-on' : ''} aria-pressed={view === 'flow'} onClick={() => onChange({ ...pane, view: 'flow' })}>
              Flow
            </button>
          </div>
        )}
        <label className="icon-btn select-overlay" title="Show a different document">
          <IconSwap />
          <select
            value={pane.docId ?? ''}
            aria-label="Show a different document"
            onChange={(e) => onChange({ ...pane, docId: e.target.value || null })}
          >
            <option value="">Choose a document…</option>
            <optgroup label="Prep">
              {docs.filter((d) => d.kind === 'prep').map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </optgroup>
            <optgroup label="Reference">
              {docs.filter((d) => d.kind === 'reference').map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        {meta && (
          <>
            {view === 'doc' && <button
              type="button"
              className={'icon-btn' + (pane.outline ? ' is-on' : '')}
              title="Outline"
              aria-label="Outline"
              aria-pressed={pane.outline}
              onClick={() => onChange({ ...pane, outline: !pane.outline })}
            >
              <IconOutline />
            </button>}
            <ExportMenu editor={editor} title={meta.title} />
            <button
              type="button"
              className={'icon-btn' + (history ? ' is-on' : '')}
              title="Version history"
              aria-label="Version history"
              aria-pressed={history}
              onClick={() => setHistory((h) => !h)}
            >
              <IconHistory />
            </button>
          </>
        )}
        {meta && ydoc && <RoundToggle ydoc={ydoc} docId={meta.id} round={round} />}
        {canClose && (
          <button type="button" className="icon-btn" title="Close pane" aria-label="Close pane" onClick={onClose}>
            <IconClose />
          </button>
        )}
      </header>

      {!meta && (
        <div className="pane-picker">
          <p>Pick a document for this pane.</p>
          <div className="picker-cols">
            {(['prep', 'reference'] as const).map((kind) => (
              <div key={kind}>
                <h3>{kind === 'prep' ? 'Prep' : 'Reference'}</h3>
                <ul>
                  {docs
                    .filter((d) => d.kind === kind)
                    .map((d) => (
                      <li key={d.id}>
                        <button type="button" onClick={() => onChange({ ...pane, docId: d.id })}>
                          {d.title}
                        </button>
                      </li>
                    ))}
                </ul>
                <button type="button" className="btn ghost small" onClick={() => onCreate(kind)}>
                  + New {kind === 'prep' ? 'prep doc' : 'reference doc'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {meta && !ydoc && <div className="pane-loading">Opening…</div>}

      {meta && ydoc && (
        <>
          {!history && editor && <Toolbar editor={editor} view={view} />}
          <div className="pane-body" hidden={history}>
            {view === 'doc' && pane.outline && editor && <Outline editor={editor} />}
            {view === 'doc' ? <DocEditor key="doc" ydoc={ydoc} docId={meta.id} onEditor={onEditor} /> : <FlowEditor key="flow" ydoc={ydoc} docId={meta.id} onEditor={onEditor} />}
          </div>
          {history && <HistoryView docId={meta.id} ydoc={ydoc} editor={editor} round={round} onClose={() => setHistory(false)} />}
        </>
      )}
    </section>
  );
}
