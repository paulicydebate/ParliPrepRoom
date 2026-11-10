import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, Fragment, useId } from 'react';
import * as Y from 'yjs';
import type { WebsocketProvider } from 'y-websocket';
import { recordEdit, toast, trackRoundDoc } from '../editor/roundGuard';
import { isRound } from '../store/roundDoc';
import { logEvent } from '../store/typingLog';
import { SPEECH_INFO } from '../model/speeches';
import { useFlowColors, useFlowTheme } from '../store/flowTheme';
import { IconChevronDown, IconChevronRight, IconMaximize, IconRestore, IconSidebar, IconSnap } from '../ui/icons';
import { connectorPath, routeBetween, type ConnectorPath } from './connectors';
import { connectorCrossings, CROSSING_SHADOW_DEFAULTS, crossingShadowExtent } from './connectorCrossings';
import { layoutFlow, METRICS } from './layout';
import {
  addRef,
  addSheet,
  childrenOf,
  createChild,
  createRoot,
  createSibling,
  deleteCell,
  deleteSheet,
  ensureSheet,
  groupCells,
  ungroupCells,
  linkCells,
  observeFlow,
  ORIGIN_LOCAL,
  readFlow,
  refKey,
  removeRef,
  renameSheet,
  resetSheetPosition,
  rootsOf,
  setMark,
  setSheetSide,
  sheetOrder,
  sheetsMap,
  unlinkCell,
  yCells,
  yText,
  type FlowCell,
  type FlowMark,
  type FlowRef,
  type FlowSheetData,
} from './model';
import { columnGeometry, GAP_PX } from './columns';
import { Flow2Canvas } from './Flow2Canvas';
import { Flow2Sidebar } from './Flow2Sidebar';
import { FlowDock } from './FlowDock';
import { directionalTarget } from './directionalTarget';
import { bindText } from './textBinding';
import './flowist/palette-0.css';
import './flowist/fonts.css';
import './flowist/flowist-theme.css';

// The new flow editor: separate cells (each its own text box), threads between an argument and its
// answers, box-select, link mode, narrow unused columns. Interaction design adapted from Flowist
// (by Elli, used with permission); the code is this app's own.


function useFlow(doc: Y.Doc): FlowSheetData[] {
  const version = useRef(0);
  const cache = useRef<{ v: number; data: FlowSheetData[] } | null>(null);
  const subscribe = useCallback(
    (fn: () => void) =>
      observeFlow(doc, () => {
        version.current++;
        fn();
      }),
    [doc],
  );
  const get = () => {
    if (!cache.current || cache.current.v !== version.current) cache.current = { v: version.current, data: readFlow(doc) };
    return cache.current.data;
  };
  return useSyncExternalStore(subscribe, get);
}

function useUndo(doc: Y.Doc) {
  return useMemo(
    () =>
      new Y.UndoManager([sheetOrder(doc), sheetsMap(doc)], {
        trackedOrigins: new Set<unknown>([ORIGIN_LOCAL, HTMLTextAreaElement]),
        captureTimeout: 600,
      }),
    [doc],
  );
}

export const MARK_GLYPH: Record<FlowMark, string> = { extended: '→', dropped: '!', answered: '✓', key: '★' };
export const MARK_LABEL: Record<FlowMark, string> = { extended: 'Extended', dropped: 'Dropped', answered: 'Answered', key: 'Key argument' };

type Peer = { name: string; color: string };

/** Who else is in which cell right now (from the live connection's presence), by cell id. */
function usePeers(provider: WebsocketProvider | null): ReadonlyMap<string, Peer[]> {
  const [peers, setPeers] = useState<ReadonlyMap<string, Peer[]>>(new Map());
  useEffect(() => {
    if (!provider) return setPeers(new Map());
    const aw = provider.awareness;
    const read = () => {
      const out = new Map<string, Peer[]>();
      aw.getStates().forEach((state, client) => {
        if (client === aw.clientID) return;
        const at = (state as { flow2?: { cell?: string } | null }).flow2;
        const user = (state as { user?: { name?: string; color?: string } }).user;
        if (!at?.cell || !user) return;
        out.set(at.cell, [...(out.get(at.cell) ?? []), { name: user.name || 'Someone', color: user.color || '#888' }]);
      });
      setPeers((prev) => {
        const same = prev.size === out.size && [...out].every(([k, v]) => prev.get(k)?.map((p) => p.name + p.color).join() === v.map((p) => p.name + p.color).join());
        return same ? prev : out;
      });
    };
    read();
    aw.on('change', read);
    return () => aw.off('change', read);
  }, [provider]);
  return peers;
}

export function Flow2Editor({
  ydoc,
  provider,
  docId,
  carets,
  onEditor,
}: {
  ydoc: Y.Doc;
  provider: WebsocketProvider | null;
  docId: string;
  space: string;
  carets: boolean;
  onEditor: (e: null) => void;
}) {
  const theme = useFlowTheme();
  const colors = useFlowColors();
  const sheets = useFlow(ydoc);
  const undo = useUndo(ydoc);
  const peers = usePeers(provider);
  // Tell partners which cell you are in (only the first window on this doc shares its cursor, so two windows never fight).
  const shareCell = (cell: string | null) => {
    if (provider && carets) provider.awareness.setLocalStateField('flow2', cell ? { cell } : null);
  };
  useEffect(() => trackRoundDoc(docId, ydoc), [docId, ydoc]);
  useEffect(() => () => provider?.awareness.setLocalStateField('flow2', null), [provider]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const sheet = sheets.find((s) => s.id === activeId) ?? sheets[0] ?? null;
  const [fly, setFly] = useState<{ id: string; n: number } | null>(null);
  const [jump, setJump] = useState<Jump | null>(null);
  const [sideOpen, setSideOpen] = useState(true);
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
    <div className="flow-wrap f2 f2-workspace" data-flow-theme={theme} data-flow-colors={colors}>
      {sideOpen && (
        <Flow2Sidebar
          sheets={sheets}
          activeId={sheet.id}
          maximizedId={maxSheet?.id ?? null}
          collapsed={collapsed}
          onGo={goTo}
          onAdd={add}
          onRename={(id, name) => renameSheet(ydoc, id, name)}
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
          <SheetView key={maxSheet.id} onDock={onDock} docId={docId} peers={peers} onCellFocus={shareCell} doc={ydoc} sheets={sheets} sheet={maxSheet} undo={undo} onPick={goTo} jump={jump} onJump={onJump} maximized={{ onRestore: () => setMax(null) }} />
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
              <SheetView onDock={onDock} docId={docId} peers={peers} onCellFocus={shareCell} doc={ydoc} sheets={sheets} sheet={s} undo={undo} onPick={goTo} embedded={{ zoom, onCollapse: () => toggleCollapse(s.id), onMaximize: () => toggleMax(s.id), onSnap: () => snap(s.id) }} jump={jump} onJump={onJump} />
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

type Focus = { id: string; at: 'start' | 'end' };

/** What the toolbar can do right now for the sheet you are working in. */
export interface DockFlags {
  linking: boolean;
  canLink: boolean;
  canUnlink: boolean;
  canGroup: boolean;
  canUngroup: boolean;
  canRef: boolean;
  canMark: boolean;
  /** The mark on the cell you are in (or on all the cells picked), if they share one. */
  mark: FlowMark | null;
}
export interface DockApi {
  link: () => void;
  unlink: () => void;
  group: () => void;
  ungroup: () => void;
  ref: (k: 'x' | 'e') => void;
  mark: (m: FlowMark) => void;
}
export type Dock = { sheetId: string; api: DockApi; flags: DockFlags };

/** Ask a sheet to put the caret in one of its cells (from a cross-application chip on another sheet). */
export interface Jump {
  sheetId: string;
  cellId: string;
  n: number;
}

export interface Embedded {
  /** Canvas zoom (the sheet is drawn scaled; mouse positions are divided by it). */
  zoom: number;
  onCollapse: () => void;
  onMaximize: () => void;
  /** Put this sheet back at the top-left of the canvas. */
  onSnap: () => void;
}

/** One sheet filling the whole view. */
export interface Maximized {
  onRestore: () => void;
}

export function SheetView({ doc, sheets, sheet, undo, onPick: _onPick, embedded, maximized, jump, onJump, docId, peers, onCellFocus, onDock }: { onDock?: (sheetId: string, dock: Dock | null) => void; docId: string; peers: ReadonlyMap<string, Peer[]>; onCellFocus: (cell: string | null) => void; doc: Y.Doc; sheets: FlowSheetData[]; sheet: FlowSheetData; undo: Y.UndoManager; onPick: (id: string) => void; embedded?: Embedded; maximized?: Maximized; jump?: Jump | null; onJump?: (sheetId: string, cellId: string) => void }) {
  const scroll = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1000);
  const [heights, setHeights] = useState<ReadonlyMap<string, number>>(new Map());
  const [focusId, setFocusId] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [linking, setLinking] = useState<{ ids: string[]; col: number } | null>(null);
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const want = useRef<Focus | null>(null);
  const hops = useRef<{ from: string; to: string; key: string }[]>([]);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ cellId: string; kind: 'x' | 'e' } | null>(null);
  const [settling, setSettling] = useState(false);
  const [, bump] = useState(0);
  const sheetUid = useId().replace(/:/g, '');

  useLayoutEffect(() => {
    const el = scroll.current;
    if (!el || embedded) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const cells = sheet.cells;
  const byId = useMemo(() => new Map(cells.map((c) => [c.id, c])), [cells]);

  // Which speech columns are wide: the first, the one the caret is in, and any with text in it.
  const focused = focusId ? byId.get(focusId) : undefined;
  const geo = columnGeometry(sheet, focused?.col ?? null, embedded ? null : width);
  const { used, colX, colW, inner } = geo;
  const zoom = embedded?.zoom ?? 1;

  const layout = useMemo(() => layoutFlow(cells, heights, METRICS), [cells, heights]);
  const top = (c: FlowCell) => layout.tops.get(c.id) ?? 0;
  const labelFor = (r: FlowRef) => {
    const owner = sheets.find((x) => x.id === r.sheet);
    const target = owner?.cells.find((k) => k.id === r.cell);
    if (!owner || !target) return { text: '(deleted)', missing: true };
    const text = target.text.trim().replace(/\s+/g, ' ');
    return { text: `${r.kind === 'x' ? `${owner.name || 'Untitled'} · ` : ''}${text.slice(0, 36) || '(empty)'}${text.length > 36 ? '…' : ''}`, missing: false };
  };
  const clickRef = (r: FlowRef) => {
    if (r.sheet === sheet.id) focusCell(r.cell, 'end');
    else onJump?.(r.sheet, r.cell);
  };
  const rectOf = (c: FlowCell) => ({ left: colX[c.col - 1], right: colX[c.col - 1] + colW[c.col - 1], top: top(c), bottom: top(c) + (layout.heights.get(c.id) ?? 30) });
  const sideOf = (col: number) => SPEECH_INFO[sheet.columns[col - 1]].side;

  const onHeight = useCallback((id: string, h: number) => {
    setHeights((prev) => (Math.abs((prev.get(id) ?? 0) - h) < 0.5 ? prev : new Map(prev).set(id, h)));
  }, []);

  // Moving focus to a cell that may not exist on screen yet.
  const focusCell = (id: string | null, at: 'start' | 'end' = 'end') => {
    if (!id) return;
    want.current = { id, at };
    bump((n) => n + 1);
  };

  useEffect(() => {
    if (jump && jump.sheetId === sheet.id && byId.has(jump.cellId)) focusCell(jump.cellId, 'end');
  }, [jump?.n]); // eslint-disable-line react-hooks/exhaustive-deps

  // While columns slide, the link lines step aside and come back once they land (as in Flowist).
  const colSig = colW.map((w) => Math.round(w)).join(',');
  const firstSig = useRef(colSig);
  useEffect(() => {
    if (firstSig.current === colSig) return;
    firstSig.current = colSig;
    setSettling(true);
    const t = setTimeout(() => setSettling(false), 230);
    return () => clearTimeout(t);
  }, [colSig]);

  const colList = (col: number) => cells.filter((c) => c.col === col).sort((a, b) => top(a) - top(b));
  const rootOf = (c: FlowCell) => {
    let r = c;
    while (r.parent && byId.get(r.parent)) r = byId.get(r.parent)!;
    return r;
  };

  // ---------- Keys inside a cell ----------
  const onCellKey = (e: React.KeyboardEvent<HTMLTextAreaElement>, c: FlowCell) => {
    const el = e.currentTarget;
    const mod = e.metaKey || e.ctrlKey;
    const key = e.key;
    if (mod && key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) undo.redo();
      else undo.undo();
      return;
    }
    if (mod && key.toLowerCase() === 'y') {
      e.preventDefault();
      undo.redo();
      return;
    }
    if (mod && e.shiftKey && key.toLowerCase() === 'l') {
      e.preventDefault();
      toggleLinking(c.id);
      return;
    }
    if (mod && e.shiftKey && (key.toLowerCase() === 'x' || key.toLowerCase() === 'e')) {
      e.preventDefault();
      setPicker({ cellId: c.id, kind: key.toLowerCase() === 'x' ? 'x' : 'e' });
      return;
    }
    if (mod && key.toLowerCase() === 'g') {
      e.preventDefault();
      if (e.shiftKey) ungroup(c);
      else group(c);
      return;
    }
    if (key === 'Escape') {
      if (linking) setLinking(null);
      else if (picked.length) setPicked([]);
      else el.blur();
      return;
    }
    if (key === 'Enter' && e.altKey) {
      e.preventDefault();
      el.setRangeText('\n', el.selectionStart, el.selectionEnd, 'end');
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    if (key === 'Enter' && mod) {
      e.preventDefault();
      focusCell(createRoot(doc, sheet.id, c.col, rootOf(c).id), 'start');
      return;
    }
    if (key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const next = colList(c.col).find((k) => top(k) > top(c) + 0.5);
      if (next) focusCell(next.id, 'start');
      else focusCell(c.parent === null ? createRoot(doc, sheet.id, c.col, c.id) : createSibling(doc, sheet.id, c.id), 'start');
      return;
    }
    if (key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        if (c.parent) focusCell(c.parent, 'end');
        return;
      }
      const kids = childrenOf(cells, c.id);
      if (kids.length) focusCell(kids[0].id, 'start');
      else focusCell(createChild(doc, sheet.id, c.id, null, sheet.columns.length), 'start');
      return;
    }
    if (key === 'Backspace' && el.value === '' && childrenOf(cells, c.id).length === 0) {
      e.preventDefault();
      const prev = colList(c.col).filter((k) => top(k) < top(c) - 0.5).at(-1);
      const fallback = prev?.id ?? c.parent ?? colList(c.col).find((k) => k.id !== c.id)?.id ?? null;
      deleteCell(doc, sheet.id, c.id);
      focusCell(fallback, 'end');
      return;
    }
    const atStart = el.selectionStart === 0 && el.selectionEnd === 0;
    const atEnd = el.selectionStart === el.value.length && el.selectionEnd === el.value.length;
    // A cell of one line has nowhere to move the caret up or down, so those keys leave it.
    const lh = parseFloat(getComputedStyle(el).lineHeight) || 16;
    const oneLine = el.scrollHeight < 2 * lh;
    const leaving = (key === 'ArrowUp' && (atStart || oneLine)) || (key === 'ArrowDown' && (atEnd || oneLine)) || (key === 'ArrowLeft' && atStart) || (key === 'ArrowRight' && atEnd);
    if (leaving && !mod && !e.altKey && !e.shiftKey) {
      // The nearest cell that way (Flowist's rule); going back along a row returns to where you came from.
      const horizontal = key === 'ArrowLeft' || key === 'ArrowRight';
      const back = horizontal ? [...hops.current].reverse().find((h) => h.to === c.id && h.key === (key === 'ArrowLeft' ? 'ArrowRight' : 'ArrowLeft')) : undefined;
      const target = (back && byId.get(back.from)) || directionalTarget(key, rectOf(c), cells.filter((k) => k.id !== c.id), rectOf);
      if (target) {
        e.preventDefault();
        if (horizontal) hops.current = [...hops.current.slice(-19), { from: c.id, to: target.id, key }];
        focusCell(target.id, key === 'ArrowUp' || key === 'ArrowLeft' ? 'end' : 'start');
      }
    }
  };

  // ---------- Groups ----------
  const group = (fallback?: FlowCell) => {
    const ids = picked.length >= 2 ? picked : [];
    const res = groupCells(doc, sheet.id, ids.length ? ids : fallback ? [fallback.id] : []);
    if (!res.ok) toast(res.error);
    else setPicked([]);
  };
  const ungroup = (fallback?: FlowCell) => {
    const g = fallback?.group;
    const ids = picked.length ? picked : g ? cells.filter((k) => k.group === g).map((k) => k.id) : [];
    ungroupCells(doc, sheet.id, ids);
  };

  // ---------- Link mode ----------
  const startLinking = (fallbackId?: string) => {
    let ids = picked.filter((id) => byId.has(id));
    if (!ids.length && fallbackId) ids = [fallbackId];
    const mine = ids.map((id) => byId.get(id)!).filter((c) => c.col >= 2);
    if (!mine.length) {
      toast('Select one or more cells in a later speech (draw a box around them), then press Link and click the argument they answer.');
      return;
    }
    const counts = new Map<number, number>();
    for (const c of mine) counts.set(c.col, (counts.get(c.col) ?? 0) + 1);
    const col = [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
    setLinking({ ids: mine.filter((c) => c.col === col).sort((a, b) => top(a) - top(b)).map((c) => c.id), col });
  };
  const toggleLinking = (fallbackId?: string) => (linking ? setLinking(null) : startLinking(fallbackId));

  const finishLink = (targetId: string) => {
    if (!linking) return;
    const target = byId.get(targetId);
    if (!target) return;
    const res = linkCells(doc, sheet.id, linking.ids, targetId);
    if ('error' in res) {
      toast(res.error);
      return;
    }
    setLinking(null);
    setPicked([]);
    focusCell(targetId, 'end');
  };

  const onCellMouseDown = (e: React.MouseEvent, c: FlowCell) => {
    if (linking) {
      e.preventDefault();
      if (c.col === linking.col - 1) finishLink(c.id);
      else toast(`Click an argument in the ${sheet.columns[linking.col - 2] ?? 'previous'} column (the speech just before), or press Esc.`);
      return;
    }
    if (e.shiftKey) {
      e.preventDefault();
      setPicked((p) => (p.includes(c.id) ? p.filter((x) => x !== c.id) : [...p, c.id]));
      return;
    }
    if (picked.length) setPicked([]);
  };

  // ---------- Empty space: click to add, drag to box-select ----------
  const colAt = (px: number) => {
    for (let i = 0; i < colX.length; i++) if (px >= colX[i] - GAP_PX / 2 && px < colX[i] + colW[i] + GAP_PX / 2) return i + 1;
    return colX.length;
  };
  const onBackground = (e: React.MouseEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('.f2-cell, .f2-add')) return;
    e.preventDefault();
    const rect = canvas.current!.getBoundingClientRect();
    const x0 = (e.clientX - rect.left) / zoom;
    const y0 = (e.clientY - rect.top) / zoom;
    let moved = false;
    const move = (ev: MouseEvent) => {
      const x1 = (ev.clientX - rect.left) / zoom;
      const y1 = (ev.clientY - rect.top) / zoom;
      if (!moved && Math.hypot(x1 - x0, y1 - y0) < 5) return;
      moved = true;
      const box = { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
      setMarquee(box);
      setPicked(
        cells
          .filter((c) => {
            const cx = colX[c.col - 1];
            const cy = top(c);
            return cx + colW[c.col - 1] >= box.x && cx <= box.x + box.w && cy + (layout.heights.get(c.id) ?? 0) >= box.y && cy <= box.y + box.h;
          })
          .map((c) => c.id),
      );
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      setMarquee(null);
      if (moved) return;
      setPicked([]);
      const col = colAt(x0);
      const roots = rootsOf(cells);
      if (y0 >= layout.ghostTop - 2) {
        const row = Math.max(0, Math.floor((y0 - layout.ghostTop) / METRICS.rowHeight));
        focusCell(createRoot(doc, sheet.id, col, roots.at(-1)?.id ?? null, row), 'start');
        return;
      }
      // A blank spot beside an argument, in the column just after it: start an answer there.
      const band = layout.bands.find((b) => y0 >= b.top && y0 <= b.top + b.height);
      const root = band ? byId.get(band.rootId) : undefined;
      if (root && col === root.col + 1) focusCell(createChild(doc, sheet.id, root.id, childrenOf(cells, root.id).at(-1)?.id ?? null, sheet.columns.length), 'start');
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up, { once: true });
  };

  const lit = useMemo(() => {
    const set = new Set<string>();
    const f = focusId ? byId.get(focusId) : undefined;
    if (!f) return set;
    const anchor = f.parent ?? (childrenOf(cells, f.id).length ? f.id : null);
    if (anchor) {
      set.add(anchor);
      for (const k of childrenOf(cells, anchor)) set.add(k.id);
    }
    return set;
  }, [focusId, byId, cells]);

  // ---------- Threads and the + buttons ----------
  const paths: ConnectorPath[] = cells
    .filter((c) => c.parent && byId.has(c.parent) && layout.tops.has(c.id) && layout.tops.has(c.parent))
    .sort((a, b) => top(a) - top(b))
    .map((c) => connectorPath(routeBetween(`${c.parent}:${c.id}`, rectOf(byId.get(c.parent!)!), rectOf(c), c.parent!, c.id)));
  const crossings = useMemo(() => connectorCrossings(paths, crossingShadowExtent(CROSSING_SHADOW_DEFAULTS)), [paths.map((p) => p.d).join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  // The line drawn first at a junction is beneath; the other casts its shadow on it (as in Flowist's ResponseConnectors).
  const paintOrder = new Map(paths.map((p, i) => [p.key, i]));
  const shadowsUnder = new Map<string, { id: string; box: { x: number; y: number; width: number; height: number }; beneath: string; above: string; x: number; y: number }[]>();
  crossings.forEach((crossing, index) => {
    const [first, second] = crossing.lines;
    const [beneath, above] = (paintOrder.get(first.key) ?? 0) < (paintOrder.get(second.key) ?? 0) ? [first, second] : [second, first];
    const entry = { id: `${sheetUid}-x${index}`, box: crossing.box, beneath: beneath.piece, above: above.piece, x: crossing.x, y: crossing.y };
    const list = shadowsUnder.get(beneath.key);
    if (!list) shadowsUnder.set(beneath.key, [entry]);
    else if (!list.some((o) => Math.hypot(o.x - entry.x, o.y - entry.y) < 1)) list.push(entry);
  });
  const adds = [...new Set(cells.filter((c) => c.parent).map((c) => c.parent!))]
    .map((pid) => childrenOf(cells, pid).at(-1))
    .filter((k): k is FlowCell => !!k && layout.tops.has(k.id));

  const total = layout.total + 8;
  const empty = cells.length === 0;

  const grouped = new Set(layout.groups.map((g) => g.id));
  // The toolbar (Flowist-style dock at the bottom of the view) acts on the sheet you are working in.
  const targets = picked.length ? picked.filter((id) => byId.has(id)) : focused ? [focused.id] : [];
  const targetCells = targets.map((id) => byId.get(id)!);
  const sharedMark = targetCells.length && targetCells.every((c) => c.mark === targetCells[0].mark) ? targetCells[0].mark : null;
  const flags: DockFlags = {
    linking: !!linking,
    canLink: targetCells.some((c) => c.col >= 2),
    canUnlink: !!focused?.parent,
    canGroup: picked.length >= 2,
    canUngroup: !!focused?.group && grouped.has(focused.group),
    canRef: !!focused,
    canMark: targetCells.length > 0,
    mark: sharedMark,
  };
  const latest = useRef<DockApi>(null as unknown as DockApi);
  latest.current = {
    link: () => toggleLinking(focusId ?? undefined),
    unlink: () => focused && unlinkCell(doc, sheet.id, focused.id),
    group: () => group(focused),
    ungroup: () => ungroup(focused),
    ref: (k) => focused && setPicker({ cellId: focused.id, kind: k }),
    mark: (m) => setMark(doc, sheet.id, targets, sharedMark === m ? null : m),
  };
  const api = useMemo<DockApi>(
    () => ({ link: () => latest.current.link(), unlink: () => latest.current.unlink(), group: () => latest.current.group(), ungroup: () => latest.current.ungroup(), ref: (k) => latest.current.ref(k), mark: (m) => latest.current.mark(m) }),
    [],
  );
  const flagsKey = JSON.stringify(flags);
  useEffect(() => {
    if (focusId) onDock?.(sheet.id, { sheetId: sheet.id, api, flags });
  }, [flagsKey, focusId, sheet.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onDock?.(sheet.id, null), [sheet.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const body = (
      <div className="f2-inner" style={{ width: inner }}>
        <div className="f2-head">
          {sheet.columns.map((s, i) => (
            <div key={s} className={`flow-col-head fl-${SPEECH_INFO[s].side}` + (used[i] ? '' : ' is-narrow')} style={{ left: colX[i], width: colW[i] }} title={SPEECH_INFO[s].name}>
              <span>{s}</span>
            </div>
          ))}
        </div>
        <div className="f2-canvas" ref={canvas} style={{ height: total }} onMouseDown={onBackground}>
          {sheet.columns.map((s, i) => (
            <div key={s} className={'f2-band' + (i % 2 ? ' is-alt' : '')} style={{ left: colX[i] - GAP_PX / 2, width: colW[i] + GAP_PX }} />
          ))}
          <div className="f2-ghost-rows" style={{ top: layout.ghostTop, height: METRICS.ghostRows * METRICS.rowHeight }} aria-hidden="true" />
          {empty && <div className="f2-hint">Click here, or press Enter, to start. Tab moves to the next speech.</div>}
          <svg className={'f2-threads' + (settling ? ' is-settling' : '')} aria-hidden="true" focusable="false">
            {paths.map((p) => (
              <Fragment key={p.key}>
                <path className="link-line" d={p.d} data-straight={p.straight && p.sourceY === p.responseY ? 'true' : undefined} data-active={lit.has(p.responseId ?? '') && lit.has(p.sourceId) ? 'true' : undefined} vectorEffect="non-scaling-stroke" />
                {shadowsUnder.get(p.key)?.map((sh) => (
                  <Fragment key={sh.id}>
                    <filter id={`${sh.id}-blur`} filterUnits="userSpaceOnUse" {...sh.box}>
                      <feGaussianBlur stdDeviation={CROSSING_SHADOW_DEFAULTS.blur} />
                    </filter>
                    <mask id={`${sh.id}-under`} maskUnits="userSpaceOnUse" {...sh.box}>
                      <path className="link-crossing-mask" d={sh.beneath} vectorEffect="non-scaling-stroke" />
                    </mask>
                    <path className="link-crossing" d={sh.above} strokeWidth={1.5 + 2 * CROSSING_SHADOW_DEFAULTS.size} strokeOpacity={CROSSING_SHADOW_DEFAULTS.opacity} filter={`url(#${sh.id}-blur)`} mask={`url(#${sh.id}-under)`} vectorEffect="non-scaling-stroke" />
                  </Fragment>
                ))}
              </Fragment>
            ))}
          </svg>
          {layout.groups.map((g) => (
            <div key={g.id} className={`f2-group fl-${sideOf(g.col)}`} style={{ left: (colX[g.col - 1] ?? 0) - 2, top: g.top - 2, width: (colW[g.col - 1] ?? 100) + 4, height: g.height + 4 }} />
          ))}
          {cells.map((c) => (
            <Cell
              key={c.id}
              doc={doc}
              sheetId={sheet.id}
              cell={c}
              x={colX[c.col - 1] ?? 0}
              w={colW[c.col - 1] ?? 100}
              y={top(c)}
              side={sideOf(c.col)}
              measured={heights.has(c.id)}
              lit={lit.has(c.id)}
              picked={picked.includes(c.id)}
              refs={c.refs.map((r) => ({ ...r, ...labelFor(r) }))}
              onRefClick={clickRef}
              onRefRemove={(r) => removeRef(doc, sheet.id, c.id, r)}
              onHover={(on) => setHoverId((h) => (on ? c.id : h === c.id ? null : h))}
              inGroup={!!c.group && grouped.has(c.group)}
              linkingFrom={!!linking?.ids.includes(c.id)}
              linkable={!!linking && c.col === linking.col - 1}
              want={want}
              onHeight={onHeight}
              docId={docId}
              mark={c.mark}
              peers={peers.get(c.id) ?? []}
              onFocus={() => {
                setFocusId(c.id);
                onCellFocus(c.id);
              }}
              onBlur={() => setTimeout(() => !document.activeElement?.closest('.f2-cell') && onCellFocus(null), 60)}
              onKeyDown={onCellKey}
              onMouseDown={onCellMouseDown}
            />
          ))}
          {adds.map((k) => (
            <button
              key={`add-${k.id}`}
              type="button"
              className={`f2-add fl-${sideOf(k.col)}`}
              style={{ left: colX[k.col - 1], width: colW[k.col - 1], top: top(k) + (layout.heights.get(k.id) ?? 30) + 3 }}
              title="Add another answer to this argument"
              aria-label="Add another answer to this argument"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                focusCell(createSibling(doc, sheet.id, k.id), 'start');
              }}
            />
          ))}
          {cells
            .filter((c) => childrenOf(cells, c.id).length === 0 && c.col < sheet.columns.length && layout.tops.has(c.id) && !(linking || marquee))
            .map((c) => (
              <button
                key={`slot-${c.id}`}
                type="button"
                className={`f2-slot fl-${sideOf(c.col + 1)}` + (hoverId === c.id || focusId === c.id ? ' is-shown' : '')}
                style={{ left: colX[c.col] ?? 0, top: top(c), width: colW[c.col] ?? 100, height: layout.heights.get(c.id) ?? 30 }}
                aria-label="Add an answer"
                title="Add an answer to this argument"
                tabIndex={-1}
                onMouseEnter={() => setHoverId(c.id)}
                onMouseLeave={() => setHoverId((h) => (h === c.id ? null : h))}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  focusCell(createChild(doc, sheet.id, c.id, null, sheet.columns.length), 'start');
                }}
              />
            ))}
          {picker && byId.get(picker.cellId) && (
            <RefPicker
              kind={picker.kind}
              x={colX[byId.get(picker.cellId)!.col - 1] ?? 0}
              y={top(byId.get(picker.cellId)!) + (layout.heights.get(picker.cellId) ?? 30) + 4}
              candidates={
                picker.kind === 'x'
                  ? sheets.filter((x) => x.id !== sheet.id).flatMap((x) => x.cells.filter((k) => k.text.trim()).map((k) => ({ ref: { kind: 'x' as const, sheet: x.id, cell: k.id }, where: x.name || 'Untitled', text: k.text })))
                  : cells.filter((k) => k.col < byId.get(picker.cellId)!.col && k.text.trim()).map((k) => ({ ref: { kind: 'e' as const, sheet: sheet.id, cell: k.id }, where: sheet.columns[k.col - 1], text: k.text }))
              }
              onPick={(ref) => {
                addRef(doc, sheet.id, picker.cellId, ref);
                setPicker(null);
                focusCell(picker.cellId, 'end');
              }}
              onClose={() => {
                setPicker(null);
                focusCell(picker.cellId, 'end');
              }}
            />
          )}
          {marquee && <div className="f2-marquee" style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }} />}
        </div>
      </div>
  );
  const bar = (
    <WindowBar
      doc={doc}
      sheet={sheet}
      onSnap={embedded?.onSnap}
      onCollapse={embedded?.onCollapse}
      onMaximize={embedded?.onMaximize}
      onRestore={maximized?.onRestore}
    />
  );
  if (maximized) {
    return (
      <div className="f2-window-body is-maximized" data-linking={linking ? 'true' : undefined}>
        {bar}
        <div className="f2-scroll" ref={scroll}>
          {body}
        </div>
      </div>
    );
  }
  return (
    <div className="f2-window-body" data-linking={linking ? 'true' : undefined}>
      {bar}
      {body}
    </div>
  );
}

/** A sheet's title bar: drag it to move the sheet; name, side, Link and the minimize and maximize buttons live here. */
function WindowBar({ doc, sheet, onSnap, onCollapse, onMaximize, onRestore }: { doc: Y.Doc; sheet: FlowSheetData; onSnap?: () => void; onCollapse?: () => void; onMaximize?: () => void; onRestore?: () => void }) {
  const [renaming, setRenaming] = useState(false);
  return (
    <div className={`f2-window-bar fl-${sheet.side}`} data-window-handle onDoubleClick={(e) => { if ((e.target as HTMLElement).closest('.f2-window-bar') === e.currentTarget && !(e.target as HTMLElement).closest('button, input, select, .f2-window-name')) (onRestore ?? onMaximize)?.(); }}>
      <span className="sheet-dot" />
      {renaming ? (
        <input
          className="sheet-rename"
          autoFocus
          defaultValue={sheet.name}
          aria-label="Sheet name"
          onBlur={(e) => {
            renameSheet(doc, sheet.id, e.target.value.trim());
            setRenaming(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') setRenaming(false);
          }}
        />
      ) : (
        <span className="f2-window-name" onDoubleClick={() => setRenaming(true)} title="Drag to move this sheet; double-click the name to rename">
          {sheet.name || 'Untitled'}
        </span>
      )}
      <select className="f2-window-side" value={sheet.side} disabled={sheet.cells.length > 0} aria-label="Side of this sheet" title="Whose sheet this is (can only change while the sheet is empty)" onChange={(e) => setSheetSide(doc, sheet.id, e.target.value as 'gov' | 'opp')}>
        <option value="gov">Gov</option>
        <option value="opp">Opp</option>
      </select>
      <span className="tb-spacer" />
      {onSnap && (
        <button type="button" className="icon-btn small" aria-label={`Move ${sheet.name || 'Untitled'} back to the top-left`} title="Snap this sheet back to the top-left of the canvas" onClick={onSnap}>
          <IconSnap />
        </button>
      )}
      {onCollapse && (
        <button type="button" className="icon-btn small" aria-label={`Minimize ${sheet.name || 'Untitled'}`} title="Minimize this sheet to its title bar" onClick={onCollapse}>
          <IconChevronDown />
        </button>
      )}
      {onMaximize && (
        <button type="button" className="icon-btn small" aria-label={`Maximize ${sheet.name || 'Untitled'}`} title="Fill the whole view with this sheet" onClick={onMaximize}>
          <IconMaximize />
        </button>
      )}
      {onRestore && (
        <button type="button" className="icon-btn small" aria-label={`Restore ${sheet.name || 'Untitled'}`} title="Back to the canvas" onClick={onRestore}>
          <IconRestore />
        </button>
      )}
    </div>
  );
}

// ---------- One cell ----------

function Cell({
  doc,
  sheetId,
  cell,
  x,
  w,
  y,
  side,
  measured,
  lit,
  picked,
  docId,
  peers,
  onBlur,
  mark,
  refs,
  onRefClick,
  onRefRemove,
  onHover,
  inGroup,
  linkingFrom,
  linkable,
  want,
  onHeight,
  onFocus,
  onKeyDown,
  onMouseDown,
}: {
  doc: Y.Doc;
  sheetId: string;
  cell: FlowCell;
  x: number;
  w: number;
  y: number;
  side: 'gov' | 'opp';
  measured: boolean;
  lit: boolean;
  picked: boolean;
  docId: string;
  peers: Peer[];
  onBlur: () => void;
  mark: FlowMark | null;
  refs: (FlowRef & { text: string; missing: boolean })[];
  onRefClick: (r: FlowRef) => void;
  onRefRemove: (r: FlowRef) => void;
  onHover: (on: boolean) => void;
  inGroup: boolean;
  linkingFrom: boolean;
  linkable: boolean;
  want: React.MutableRefObject<Focus | null>;
  onHeight: (id: string, h: number) => void;
  onFocus: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>, c: FlowCell) => void;
  onMouseDown: (e: React.MouseEvent, c: FlowCell) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);

  const fit = useCallback(() => {
    const el = area.current;
    const box = wrap.current;
    if (!el || !box) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
    onHeight(cell.id, box.offsetHeight);
  }, [cell.id, onHeight]);

  // Bind the text box to this cell's shared text.
  useLayoutEffect(() => {
    const el = area.current;
    const text = yText(yCells(sheetsMapGet(doc, sheetId)).get(cell.id)!);
    if (!el || !text) return;
    // In a round doc every local edit goes in the typing log, and pasting and dropping text in are blocked.
    const off = bindText(el, text, (e) => {
      if (isRound(doc)) recordEdit(docId, e.ins, e.deleted);
    });
    const block = (e: Event) => {
      if (!isRound(doc)) return;
      const kind = e.type === 'drop' || (e as InputEvent).inputType === 'insertFromDrop' ? 'drop-blocked' : 'paste-blocked';
      e.preventDefault();
      const size = (e as ClipboardEvent).clipboardData?.getData('text')?.length ?? (e as DragEvent).dataTransfer?.getData('text')?.length ?? 0;
      logEvent(docId, { k: kind, n: size });
      toast(kind === 'paste-blocked' ? 'Paste is off in round docs. Type it in.' : 'Drag and drop is off in round docs.');
    };
    const guardInput = (e: Event) => {
      const t = (e as InputEvent).inputType;
      if (t === 'insertFromPaste' || t === 'insertFromPasteAsQuotation' || t === 'insertFromYank' || t === 'insertFromDrop') block(e);
    };
    const allowDrop = (e: Event) => {
      if (isRound(doc)) e.preventDefault();
    };
    el.addEventListener('paste', block);
    el.addEventListener('drop', block);
    el.addEventListener('dragover', allowDrop);
    el.addEventListener('beforeinput', guardInput);
    el.addEventListener('input', fit);
    el.addEventListener('flow2-remote', fit);
    fit();
    return () => {
      off();
      el.removeEventListener('paste', block);
      el.removeEventListener('drop', block);
      el.removeEventListener('dragover', allowDrop);
      el.removeEventListener('beforeinput', guardInput);
      el.removeEventListener('input', fit);
      el.removeEventListener('flow2-remote', fit);
    };
  }, [doc, sheetId, cell.id, fit, docId]);

  // A cell's height depends on its width.
  const refSig = refs.map((r) => refKey(r) + r.text).join('|');
  useLayoutEffect(fit, [w, fit, refSig]);

  // Take the focus someone asked for.
  useLayoutEffect(() => {
    const f = want.current;
    if (f && f.id === cell.id && area.current) {
      want.current = null;
      area.current.focus();
      const at = f.at === 'start' ? 0 : area.current.value.length;
      area.current.setSelectionRange(at, at);
    }
  });

  return (
    <div
      ref={wrap}
      className={`f2-cell fl-${side}` + (lit ? ' is-lit' : '') + (picked ? ' is-picked' : '') + (inGroup ? ' in-group' : '') + (mark ? ` mark-${mark}` : '') + (peers.length ? ' has-peer' : '') + (linkingFrom ? ' is-linking' : '') + (linkable ? ' is-linkable' : '') + (measured ? '' : ' is-measuring')}
      style={{ left: x, top: y, width: w, ...(peers.length ? ({ ['--peer' as string]: peers[0].color } as React.CSSProperties) : {}) }}
      onMouseDown={(e) => onMouseDown(e, cell)}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
    >
      {mark && (
        <span className={`f2-mark f2-mark-${mark}`} title={MARK_LABEL[mark]} aria-label={MARK_LABEL[mark]}>
          {MARK_GLYPH[mark]}
        </span>
      )}
      {peers.length > 0 && <span className="f2-peer" style={{ background: peers[0].color }}>{peers.map((p) => p.name).join(', ')}</span>}
      <textarea ref={area} rows={1} spellCheck aria-label="Cell" onFocus={onFocus} onBlur={onBlur} onKeyDown={(e) => onKeyDown(e, cell)} />
      {refs.length > 0 && (
        <div className="f2-refs">
          {refs.map((r) => (
            <span key={refKey(r)} className={'f2-ref' + (r.missing ? ' is-missing' : '')} title={r.kind === 'x' ? 'Cross-applied from another sheet (click to go there)' : 'Extends an earlier argument (click to go there)'}>
              <button type="button" className="f2-ref-go" tabIndex={-1} onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); if (!r.missing) onRefClick(r); }}>
                {r.kind === 'x' ? '↗' : '↺'} {r.text}
              </button>
              <button type="button" className="f2-ref-x" tabIndex={-1} aria-label="Remove" onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onRefRemove(r); }}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function sheetsMapGet(doc: Y.Doc, id: string): Y.Map<unknown> {
  return sheetsMap(doc).get(id)!;
}

/** A small search box listing cells to point at (for cross-apply and extend). */
function RefPicker({ kind, x, y, candidates, onPick, onClose }: { kind: 'x' | 'e'; x: number; y: number; candidates: { ref: FlowRef; where: string; text: string }[]; onPick: (r: FlowRef) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [at, setAt] = useState(0);
  const list = candidates.filter((c) => c.text.toLowerCase().includes(q.toLowerCase()) || c.where.toLowerCase().includes(q.toLowerCase())).slice(0, 30);
  return (
    <div className="f2-picker" style={{ left: x, top: y }} onMouseDown={(e) => e.stopPropagation()}>
      <input
        autoFocus
        value={q}
        placeholder={kind === 'x' ? 'Cross-apply an argument from another sheet…' : 'Extend an earlier argument…'}
        aria-label="Search cells"
        onChange={(e) => {
          setQ(e.target.value);
          setAt(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
          else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setAt((a) => Math.min(list.length - 1, a + 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setAt((a) => Math.max(0, a - 1));
          } else if (e.key === 'Enter' && list[at]) {
            e.preventDefault();
            onPick(list[at].ref);
          }
        }}
      />
      <div className="f2-picker-list" role="listbox">
        {list.length === 0 && <div className="f2-picker-empty">{candidates.length ? 'Nothing matches.' : kind === 'x' ? 'No other sheet has anything typed yet.' : 'Nothing earlier on this sheet yet.'}</div>}
        {list.map((c, i) => (
          <button key={refKey(c.ref)} type="button" role="option" aria-selected={i === at} className={i === at ? 'is-on' : ''} onMouseEnter={() => setAt(i)} onMouseDown={(e) => { e.preventDefault(); onPick(c.ref); }}>
            <span className="f2-picker-where">{c.where}</span> {c.text.slice(0, 80)}
          </button>
        ))}
      </div>
    </div>
  );
}
