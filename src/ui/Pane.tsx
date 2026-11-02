import type { Editor } from '@tiptap/react';
import { useCallback, useEffect, useState } from 'react';
import { renameDoc, type DocMeta } from '../store/docs';
import { DocEditor, Outline, Toolbar } from './DocEditor';
import { FlowEditor } from './FlowEditor';
import { HistoryView } from './HistoryView';
import { IconClose, IconHistory, IconOutline, IconSwap } from './icons';
import { useYDoc } from './useYDoc';

export interface PaneState {
  key: string;
  docId: string | null;
  outline: boolean;
  view?: 'doc' | 'flow';
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
  onFocus,
  onChange,
  onClose,
  onCreate,
}: {
  pane: PaneState;
  docs: DocMeta[];
  focused: boolean;
  canClose: boolean;
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

  return (
    <section
      className={'pane' + (focused ? ' is-focused' : '')}
      onPointerDownCapture={onFocus}
      onFocusCapture={onFocus}
      aria-label={meta ? meta.title : 'Empty pane'}
    >
      <header className="pane-head">
        {meta ? (
          <>
            <span className={'badge ' + meta.kind}>{meta.kind === 'prep' ? 'Prep' : 'Reference'}</span>
            <TitleInput meta={meta} />
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
            {view === 'doc' ? <DocEditor key="doc" ydoc={ydoc} onEditor={onEditor} /> : <FlowEditor key="flow" ydoc={ydoc} onEditor={onEditor} />}
          </div>
          {history && <HistoryView docId={meta.id} ydoc={ydoc} editor={editor} onClose={() => setHistory(false)} />}
        </>
      )}
    </section>
  );
}
