import { useCallback, useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import type { WebsocketProvider } from 'y-websocket';
import { recordEdit, trackRoundDoc } from '../editor/roundGuard';
import { isRound, useResolution } from '../store/roundDoc';
import { useFlowColors, useFlowTheme } from '../store/flowTheme';
import { IconChevronRight, IconSidebar } from '../ui/icons';
import {
  addSheet,
  deleteSheet,
  ensureSheet,
  renameSheet,
  resetSheetPosition,
  type FlowSheetData,
} from './model';
import { publishFlow } from '../store/flowPins';
import { Flow2Canvas } from './Flow2Canvas';
import { Flow2Sidebar } from './Flow2Sidebar';
import { FlowDock } from './FlowDock';
import './flowist/palette-0.css';
import './flowist/fonts.css';
import './flowist/flowist-theme.css';
import { lastWorkspace, setLastWorkspace, useFlow, usePeers, useUndo } from './flowHooks';
import { SheetView, type Dock, type Jump } from './SheetView';

export { MARK_GLYPH, MARK_LABEL } from './flowHooks';
export { SheetView, type Dock, type DockApi, type DockFlags, type Embedded, type Jump, type Maximized } from './SheetView';

// The new flow editor: separate cells (each its own text box), threads between an argument and its
// answers, box-select, link mode, narrow unused columns. Interaction design adapted from Flowist
// (by Elli, used with permission); the code is this app's own.


export function Flow2Editor({
  ydoc,
  provider,
  docId,
  space,
  carets,
  focus,
  onEditor,
}: {
  ydoc: Y.Doc;
  provider: WebsocketProvider | null;
  docId: string;
  space: string;
  carets: boolean;
  /** A request from search or the pin board to open a cell (n changes each time). */
  focus?: { blockId: string; n: number };
  onEditor: (e: null) => void;
}) {
  const theme = useFlowTheme();
  const colors = useFlowColors();
  const sheets = useFlow(ydoc);
  const undo = useUndo(ydoc, docId);
  const peers = usePeers(provider);
  // Tell partners which cell you are in (only the first window on this doc shares its cursor, so two windows never fight).
  const shareCell = (cell: string | null, at?: number) => {
    if (provider && carets) provider.awareness.setLocalStateField('flow2', cell ? { cell, at } : null);
  };
  useEffect(() => trackRoundDoc(docId, ydoc), [docId, ydoc]);
  useEffect(() => () => void (carets && provider?.awareness.setLocalStateField('flow2', null)), [provider, carets]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const sheet = sheets.find((s) => s.id === activeId) ?? sheets[0] ?? null;
  const [fly, setFly] = useState<{ id: string; n: number } | null>(null);
  const [jump, setJump] = useState<Jump | null>(null);
  const [sideOpen, setSideOpen] = useState(true);
  const resolution = useResolution(ydoc);
  // The pin board follows the sheet in view and offers these sheet names.
  const namesKey = sheets.map((s) => s.name.trim()).join('\u0000');
  useEffect(() => {
    publishFlow(docId, { sheets: sheets.map((s) => s.name.trim()).filter(Boolean), active: (sheet?.name ?? '').trim() });
  }, [docId, namesKey, sheet?.id, sheet?.name]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => publishFlow(docId, null), [docId]);
  const [dock, setDock] = useState<Dock | null>(null);
  const onDock = useCallback((id: string, d: Dock | null) => setDock((cur) => (d ? d : cur?.sheetId === id ? null : cur)), []);

  // What is minimized or maximized is this window's view of the flow, not part of the shared document.
  const keyC = `pp-flow2-min-${docId}`;
  const keyM = `pp-flow2-max-${docId}`;
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => {
    try {
      return new Set<string>(JSON.parse(localStorage.getItem(keyC) ?? '[]') as string[]);
    } catch {
      return new Set<string>();
    }
  });
  const [maximizedId, setMaximizedId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(keyM) || null;
    } catch {
      return null;
    }
  });
  const remember = (c: ReadonlySet<string>, m: string | null) => {
    try {
      localStorage.setItem(keyC, JSON.stringify([...c]));
      if (m) localStorage.setItem(keyM, m);
      else localStorage.removeItem(keyM);
    } catch {
      /* ignore */
    }
  };
  const toggleCollapse = (id: string) => {
    const next = new Set(collapsed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setCollapsed(next);
    remember(next, maximizedId);
  };
  const setMax = (id: string | null) => {
    setMaximizedId(id);
    remember(collapsed, id);
  };

  useEffect(() => onEditor(null), [onEditor]);

  // A flow always has a sheet; wait for the server's copy first so two partners do not each make one.
  useEffect(() => {
    if (!provider) return ensureSheet(ydoc);
    let done = false;
    const go = () => {
      if (!done) {
        done = true;
        ensureSheet(ydoc);
      }
    };
    if (provider.synced) go();
    provider.on('sync', go);
    const t = setTimeout(go, 3000);
    return () => {
      provider.off('sync', go);
      clearTimeout(t);
    };
  }, [ydoc, provider]);

  // Search and the pin board open a cell by id: find its sheet and go there.
  const focusTaken = useRef(0);
  useEffect(() => {
    if (!focus || focusTaken.current === focus.n) return;
    const hit = sheets.find((s) => s.cells.some((c) => c.id === focus.blockId));
    if (hit) {
      focusTaken.current = focus.n;
      if (collapsed.has(hit.id)) toggleCollapse(hit.id);
      onJump(hit.id, focus.blockId);
    }
  }, [focus?.n, sheets.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Undo and Redo also work when no cell has the caret (after an undo removed the cell you were in, the keys would go nowhere).
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (!(e.metaKey || e.ctrlKey) || (key !== 'z' && key !== 'y') || e.defaultPrevented) return;
      const active = document.activeElement as HTMLElement | null;
      const typing = !!active && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT' || active.tagName === 'SELECT' || active.isContentEditable);
      const here = wrapRef.current;
      if (typing || !here || document.querySelector('dialog[open]')) return;
      const inside = !!active && here.contains(active);
      if (!inside && !(active === document.body && lastWorkspace === here)) return;
      e.preventDefault();
      if (key === 'y' || e.shiftKey) undo.redo();
      else undo.undo();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (lastWorkspace === wrapRef.current) setLastWorkspace(null);
    };
  }, [undo]);

  if (!sheet) return <div className="flow-wrap" data-flow-theme={theme} />;
  const maxSheet = maximizedId ? sheets.find((s) => s.id === maximizedId) ?? null : null;
  const goTo = (id: string) => {
    setActiveId(id);
    // While one sheet fills the view, the list switches which sheet that is (as in Flowist).
    if (maxSheet) setMax(id);
    else setFly((f) => ({ id, n: (f?.n ?? 0) + 1 }));
  };
  const onJump = (sheetId: string, cellId: string) => {
    goTo(sheetId);
    setJump((j) => ({ sheetId, cellId, n: (j?.n ?? 0) + 1 }));
  };
  const toggleMax = (id: string) => (maximizedId === id ? setMax(null) : (setActiveId(id), setMax(id)));
  const del = (id: string) => {
    const rest = sheets.filter((s) => s.id !== id);
    deleteSheet(ydoc, id);
    try {
      localStorage.removeItem(`pp-flow2-cols-${docId}-${id}`);
      localStorage.removeItem(`pp-flow2-pincol-${docId}-${id}`);
    } catch {
      /* ignore */
    }
    if (activeId === id) setActiveId(rest[0]?.id ?? null);
    if (maximizedId === id) setMax(rest[0]?.id ?? null);
  };
  const add = (side: 'gov' | 'opp') => goTo(addSheet(ydoc, side));
  // Back to the top-left: forget where the sheet was put, then show it there.
  const snap = (id: string) => {
    resetSheetPosition(ydoc, id);
    setActiveId(id);
    setTimeout(() => setFly((f) => ({ id, n: (f?.n ?? 0) + 1 })), 80);
  };

  return (
    <div className="flow-wrap f2 f2-workspace" data-flow-theme={theme} data-flow-colors={colors} ref={wrapRef} onPointerDownCapture={() => setLastWorkspace(wrapRef.current)} onFocusCapture={() => setLastWorkspace(wrapRef.current)}>
      {sideOpen && (
        <Flow2Sidebar
          sheets={sheets}
          activeId={sheet.id}
          maximizedId={maxSheet?.id ?? null}
          collapsed={collapsed}
          onGo={goTo}
          onAdd={add}
          onRename={(id, name) => {
            const old = sheets.find((x) => x.id === id)?.name ?? '';
            if (old === name) return;
            renameSheet(ydoc, id, name);
            if (isRound(ydoc)) recordEdit(docId, name, old);
          }}
          blockPaste={() => isRound(ydoc)}
          resolution={resolution}
          onDelete={del}
          onToggleCollapse={toggleCollapse}
          onToggleMaximize={toggleMax}
          onClose={() => setSideOpen(false)}
        />
      )}
      <div className="f2-main">
        {!sideOpen && (
          <button type="button" className="f2-side-open icon-btn small" aria-label="Show the sheet list" title="Show the sheet list" onClick={() => setSideOpen(true)}>
            <IconSidebar />
          </button>
        )}
        {maxSheet ? (
          <SheetView space={space} key={maxSheet.id} onDock={onDock} docId={docId} peers={peers} onCellFocus={shareCell} doc={ydoc} sheets={sheets} sheet={maxSheet} undo={undo} onPick={goTo} jump={jump} onJump={onJump} maximized={{ onRestore: () => setMax(null) }} />
        ) : (
          <Flow2Canvas
            doc={ydoc}
            sheets={sheets}
            activeId={sheet.id}
            onActive={setActiveId}
            fly={fly}
            collapsed={collapsed}
            renderCollapsed={(s) => <CollapsedBar sheet={s} onExpand={() => toggleCollapse(s.id)} />}
            renderLive={(s, zoom) => (
              <SheetView space={space} onDock={onDock} docId={docId} peers={peers} onCellFocus={shareCell} doc={ydoc} sheets={sheets} sheet={s} undo={undo} onPick={goTo} embedded={{ zoom, onCollapse: () => toggleCollapse(s.id), onMaximize: () => toggleMax(s.id), onSnap: () => snap(s.id) }} jump={jump} onJump={onJump} />
            )}
          />
        )}
        <FlowDock dock={dock} undo={undo} />
      </div>
    </div>
  );
}

/** A minimized sheet on the canvas: its title bar only. */
function CollapsedBar({ sheet, onExpand }: { sheet: FlowSheetData; onExpand: () => void }) {
  return (
    <div className="f2-window-body is-collapsed">
      <div className={`f2-window-bar fl-${sheet.side}`} data-window-handle>
        <span className="sheet-dot" />
        <span className="f2-window-name">{sheet.name || 'Untitled'}</span>
        <span className="tb-spacer" />
        <button type="button" className="icon-btn small" aria-label={`Show ${sheet.name || 'Untitled'}`} title="Show the full sheet" onClick={onExpand}>
          <IconChevronRight />
        </button>
      </div>
    </div>
  );
}

// ---------- The sheet ----------

