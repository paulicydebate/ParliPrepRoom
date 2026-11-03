import type { Editor } from '@tiptap/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { WebsocketProvider } from 'y-websocket';
import type * as Y from 'yjs';
import { toast } from '../editor/roundGuard';
import { renameDoc, setDocRound, type DocMeta } from '../store/docs';
import { setRound, useRound } from '../store/roundDoc';
import { useConnectionCheck, useSyncStatus, type SyncStatus } from '../store/sync';
import { DocEditor, Outline, Toolbar } from './DocEditor';
import { FlowEditor } from './FlowEditor';
import { CheckLinkButton, PartnersButton } from './RoundTools';
import { PinButton } from './RoundModeUI';
import { HistoryView } from './HistoryView';
import { IconClose, IconDownload, IconHistory, IconLock, IconMore, IconOutline, IconShare, IconSwap } from './icons';
import { useYDoc } from './useYDoc';
import { PanelHandle, usePanelWidth } from './PanelResize';

export interface PaneState {
  key: string;
  docId: string | null;
  outline: boolean;
  view?: 'doc' | 'flow';
  /** Jump request from the block finder or pin board (n changes each time). */
  focus?: { blockId: string; n: number };
}

/** Download the doc as Word, or its flow as Excel. */
async function exportDoc(editor: Editor | null, title: string, kind: 'docx' | 'xlsx') {
  if (!editor) return;
  const { download, safeFilename } = await import('../export/runs');
  const name = safeFilename(title);
  if (kind === 'docx') {
    const { buildDocx } = await import('../export/docx');
    download(await buildDocx(editor.state.doc, title), `${name}.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  } else {
    const { buildFlowXlsx } = await import('../export/xlsx');
    download(new Uint8Array(buildFlowXlsx(editor.state.doc)), `${name} flow.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  }
}

async function copyShareLink(docId: string) {
  const link = `${location.origin}/#doc=${encodeURIComponent(docId)}`;
  try {
    await navigator.clipboard.writeText(link);
    toast('Link copied. Teammates who can see this doc can open it with the link.');
  } catch {
    window.prompt('Copy this link', link);
  }
}

const closeMenu = (e: React.MouseEvent) => {
  const d = e.currentTarget.closest('details');
  if (d) d.open = false;
};

function ExportMenu({ editor, title }: { editor: Editor | null; title: string }) {
  const [busy, setBusy] = useState(false);
  const run = async (e: React.MouseEvent, kind: 'docx' | 'xlsx') => {
    closeMenu(e);
    setBusy(true);
    try {
      await exportDoc(editor, title, kind);
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

/** Pick which doc this window shows. */
function DocSwitcher({ docs, value, onPick }: { docs: DocMeta[]; value: string | null; onPick: (id: string | null) => void }) {
  return (
    <label className="icon-btn select-overlay doc-switch" title="Show a different document">
      <IconSwap />
      <select value={value ?? ''} aria-label="Show a different document" onChange={(e) => onPick(e.target.value || null)}>
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
        <span className="switch" /> <IconLock /> <span className="round-toggle-label">Round doc</span>
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
      <span className="switch" /> <IconLock /> <span className={confirmOff ? '' : 'round-toggle-label'}>{confirmOff ? 'Turn off? (logged)' : 'Round doc'}</span>
    </button>
  );
}

function SyncDot({ status, provider }: { status: SyncStatus; provider: WebsocketProvider | null }) {
  const label = status === 'synced' ? 'Saved to the server' : status === 'connecting' ? 'Connecting…' : 'Offline: saved on this device, syncs when back online';
  const [open, setOpen] = useState(false);
  // Fixed position, so a narrow window's edge doesn't cut the panel off.
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const check = useConnectionCheck(provider, open && status !== 'offline');
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) ref.current.open = false;
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);
  return (
    <details
      ref={ref}
      className="sync-check"
      onToggle={(e) => {
        const d = e.currentTarget as HTMLDetailsElement;
        setOpen(d.open);
        if (d.open) {
          const r = d.querySelector('summary')!.getBoundingClientRect();
          setPos({ top: r.bottom + 10, left: Math.max(8, Math.min(r.left - 12, window.innerWidth - 290)) });
        }
      }}
    >
      <summary className={`sync-dot ${status}`} title={`${label}. Tap for connection details.`} aria-label={`${label}. Connection details`} />
      <div className="menu sync-pop" role="dialog" aria-label="Connection" style={pos ? { position: 'fixed', top: pos.top, left: pos.left } : undefined}>
        <p className="sync-line">
          <span className={`sync-dot ${status}`} /> <strong>{status === 'synced' ? 'Connected' : status === 'connecting' ? 'Connecting…' : 'Offline'}</strong>
        </p>
        {status === 'offline' ? (
          <p className="muted small">Your edits are saved on this device and go to the server when you're back online. They merge with your partner's edits automatically.</p>
        ) : (
          <>
            <dl className="sync-stats">
              <div>
                <dt>Round trip</dt>
                <dd>{check.rtt === null ? (check.slow ? 'No answer yet' : 'Checking…') : `${check.rtt} ms`}</dd>
              </div>
              <div>
                <dt>Your edits</dt>
                <dd className={check.checked && check.unsaved === 0 ? 'ok' : ''}>
                  {!check.checked ? 'Checking…' : check.unsaved === 0 ? '✓ All saved on the server' : `${check.unsaved} on the way…`}
                </dd>
              </div>
            </dl>
            <p className="muted small">
              {check.slow
                ? 'The server is slow to answer. Keep typing: nothing is lost, and edits go through when the connection catches up.'
                : check.typical !== null
                  ? `${check.typical < 150 ? 'Fast' : check.typical < 400 ? 'Fine' : 'Slow'} connection (typical ${check.typical} ms). This is how long your partner waits to see your typing. Edits always merge the same way, whatever the delay.`
                  : 'Checking the connection every 2 seconds while this is open.'}
            </p>
          </>
        )}
      </div>
    </details>
  );
}

function ShareButton({ docId }: { docId: string }) {
  return (
    <button
      type="button"
      className="icon-btn"
      title="Copy a link to this doc for a teammate"
      aria-label="Share"
      onClick={() => void copyShareLink(docId)}
    >
      <IconShare />
    </button>
  );
}

function TitleInput({ meta, ydoc, provider }: { meta: DocMeta; ydoc: Y.Doc | null; provider: WebsocketProvider | null }) {
  const [value, setValue] = useState(meta.title);
  useEffect(() => setValue(meta.title), [meta.title]);
  // The title also lives inside the doc, so a partner who opens a shared
  // link sees the same name. When the doc first opens, the doc's copy wins
  // (a partner may have renamed it); after that, a rename made anywhere on
  // this device (sidebar or title box) is written into the doc.
  const seeded = useRef<Y.Doc | null>(null);
  useEffect(() => {
    if (!ydoc) return;
    const map = ydoc.getMap('settings');
    const pull = (e?: Y.YMapEvent<unknown>) => {
      if (e?.transaction.local) return;
      const t = map.get('title');
      if (typeof t === 'string' && t && t !== meta.title) void renameDoc(meta.id, t);
    };
    let seed: (() => void) | null = null;
    if (seeded.current === ydoc) {
      if (map.get('title') !== meta.title) map.set('title', meta.title);
    } else {
      // Only fill in a missing title once we've heard from the server, so a
      // newly joined device doesn't overwrite the real one with a placeholder.
      seed = () => {
        seeded.current = ydoc;
        if (typeof map.get('title') !== 'string') map.set('title', meta.title);
        else pull();
      };
      if (!provider || provider.synced) seed();
      else provider.once('sync', seed);
    }
    map.observe(pull);
    return () => {
      map.unobserve(pull);
      if (seed) provider?.off('sync', seed);
    };
  }, [ydoc, provider, meta.id, meta.title]);
  const commit = () => {
    const t = value.trim();
    if (t && t !== meta.title) {
      void renameDoc(meta.id, t);
      ydoc?.getMap('settings').set('title', t);
    } else setValue(meta.title);
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
  space,
  roundMode = false,
  onEditorChange,
  onFocus,
  onChange,
  onClose,
  onCreate,
  focusMode,
  onFocusMode,
}: {
  pane: PaneState;
  docs: DocMeta[];
  focused: boolean;
  canClose: boolean;
  alsoOpen?: boolean;
  /** Current team (or 'personal'), for pins. */
  space: string;
  /** Round Mode: only round docs can be shown. */
  roundMode?: boolean;
  /** Tells the app which editor this pane shows (for inserting blocks). */
  onEditorChange?: (e: Editor | null) => void;
  onFocus: () => void;
  onChange: (p: PaneState) => void;
  onClose: () => void;
  onCreate: (kind: DocMeta['kind']) => void;
  /** One window fills the screen. */
  focusMode: boolean;
  onFocusMode: () => void;
}) {
  const meta = docs.find((d) => d.id === pane.docId) ?? null;
  const opened = useYDoc(meta && !(roundMode && !meta.round) ? meta.id : null);
  const ydoc = opened?.doc ?? null;
  const provider = opened?.provider ?? null;
  const syncStatus = useSyncStatus(provider);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [history, setHistory] = useState(false);
  const outlineWidth = usePanelWidth('outline', 220, 140, 400);
  const reportRef = useRef(onEditorChange);
  reportRef.current = onEditorChange;
  const onEditor = useCallback((e: Editor | null) => {
    setEditor(e);
    reportRef.current?.(e);
  }, []);

  useEffect(() => setHistory(false), [pane.docId]);
  const view = pane.view ?? 'doc';
  const round = useRound(ydoc);

  // Jump to a block (from search or the pin board) once the editor is ready.
  useEffect(() => {
    if (!editor || !pane.focus) return;
    const { blockId } = pane.focus;
    let pos = -1;
    editor.state.doc.forEach((n, p) => {
      if (pos < 0 && n.attrs.id === blockId) pos = p;
    });
    if (pos < 0) return;
    const node = editor.state.doc.nodeAt(pos)!;
    editor.chain().focus().setTextSelection(pos + 1 + node.content.size).run();
    const dom = editor.view.nodeDOM(pos);
    if (dom instanceof HTMLElement) {
      dom.scrollIntoView({ block: 'center', behavior: 'smooth' });
      dom.classList.add('pp-flash');
      setTimeout(() => dom.classList.remove('pp-flash'), 1600);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, pane.focus?.n]);
  // Keep the sidebar's round-doc dot right when a partner flips the switch.
  useEffect(() => {
    if (meta && ydoc && !!meta.round !== round) void setDocRound(meta.id, round);
  }, [meta, ydoc, round]);

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
            <TitleInput meta={meta} ydoc={ydoc} provider={provider} />
            {syncStatus !== 'off' && <SyncDot status={syncStatus} provider={provider} />}
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
        <DocSwitcher docs={docs} value={pane.docId} onPick={(docId) => onChange({ ...pane, docId })} />
        {meta && (
          <>
            {/* Wide windows show these as icons; narrow ones fold them into the ⋯ menu. */}
            <div className="pane-tools">
              {view === 'doc' && (
                <button
                  type="button"
                  className={'icon-btn' + (pane.outline ? ' is-on' : '')}
                  title="Outline"
                  aria-label="Outline"
                  aria-pressed={pane.outline}
                  onClick={() => onChange({ ...pane, outline: !pane.outline })}
                >
                  <IconOutline />
                </button>
              )}
              {provider && <ShareButton docId={meta.id} />}
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
            </div>
            <details className="pane-more">
              <summary className="icon-btn" aria-label="More" title="More">
                <IconMore />
              </summary>
              <div className="menu">
                <label className="menu-select">
                  <span>Show a different doc</span>
                  <select
                    value={pane.docId ?? ''}
                    onChange={(e) => {
                      const d = e.currentTarget.closest('details');
                      if (d) d.open = false;
                      onChange({ ...pane, docId: e.target.value || null });
                    }}
                  >
                    {docs.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.title}
                      </option>
                    ))}
                  </select>
                </label>
                {view === 'doc' && (
                  <button type="button" onClick={(e) => (closeMenu(e), onChange({ ...pane, outline: !pane.outline }))}>
                    {pane.outline ? 'Hide outline' : 'Show outline'}
                  </button>
                )}
                <button type="button" onClick={(e) => (closeMenu(e), onFocusMode())}>
                  {focusMode ? 'Show all windows' : 'Fill the screen with this window'}
                </button>
                <button type="button" onClick={(e) => (closeMenu(e), setHistory((h) => !h))}>
                  {history ? 'Close history' : 'Version history'}
                </button>
                {provider && (
                  <button type="button" onClick={(e) => (closeMenu(e), void copyShareLink(meta.id))}>
                    Copy link to this doc
                  </button>
                )}
                <button type="button" onClick={(e) => (closeMenu(e), void exportDoc(editor, meta.title, 'docx'))}>
                  Download Word (.docx)
                </button>
                <button type="button" onClick={(e) => (closeMenu(e), void exportDoc(editor, meta.title, 'xlsx'))}>
                  Download Excel flow (.xlsx)
                </button>
              </div>
            </details>
          </>
        )}
        {meta && ydoc && <RoundToggle ydoc={ydoc} docId={meta.id} round={round} />}
        {canClose && (
          <button type="button" className="icon-btn" title="Close pane" aria-label="Close pane" onClick={onClose}>
            <IconClose />
          </button>
        )}
      </header>
      {meta && round && (
        <div className="round-strip">
          <span>
            <IconLock /> {meta.roundLabel ? `${meta.roundLabel}${meta.tournamentName ? ` · ${meta.tournamentName}` : ''} · ` : ''}Round doc · paste is off · typing is recorded
          </span>
          <span className="tb-spacer" />
          {provider && <PartnersButton meta={meta} />}
          {provider && <CheckLinkButton meta={meta} />}
        </div>
      )}

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

      {meta && !ydoc && !(roundMode && !meta.round) && <div className="pane-loading">Opening…</div>}

      {meta && roundMode && !meta.round && (
        <div className="pane-blocked">
          <IconLock />
          <p>
            <strong>Round Mode is on.</strong> Only round docs (typed by hand during prep) can be open during the round.
          </p>
          <button type="button" className="btn" onClick={() => onChange({ ...pane, docId: null })}>
            Pick a round doc
          </button>
        </div>
      )}

      {meta && ydoc && !(roundMode && !meta.round) && (
        <>
          {!history && editor && <Toolbar editor={editor} view={view} extra={<PinButton editor={editor} docId={meta.id} space={space} />} />}
          <div className="pane-body" hidden={history} style={{ ['--outline-w' as string]: `${outlineWidth.width}px` }}>
            {view === 'doc' && pane.outline && editor && (
              <>
                <Outline editor={editor} />
                <PanelHandle panel={outlineWidth} edge="right" label="Resize the outline" onCollapse={() => onChange({ ...pane, outline: false })} />
              </>
            )}
            {view === 'doc' ? <DocEditor key="doc" ydoc={ydoc} provider={provider} docId={meta.id} onEditor={onEditor} /> : <FlowEditor key="flow" ydoc={ydoc} provider={provider} docId={meta.id} space={space} onEditor={onEditor} />}
          </div>
          {history && <HistoryView docId={meta.id} ydoc={ydoc} editor={editor} round={round} checkToken={meta.checkToken} server={!!provider} onClose={() => setHistory(false)} />}
        </>
      )}
    </section>
  );
}
