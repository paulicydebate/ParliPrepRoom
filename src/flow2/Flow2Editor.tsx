import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, Fragment, useId, type ReactNode } from 'react';
import * as Y from 'yjs';
import type { WebsocketProvider } from 'y-websocket';
import { toast } from '../editor/roundGuard';
import { SPEECH_INFO } from '../model/speeches';
import { useFlowTheme } from '../store/flowTheme';
import { ColorsButton } from '../ui/FlowEditor';
import { IconPlus, IconThread } from '../ui/icons';
import { connectorPath, routeBetween, type ConnectorPath } from './connectors';
import { connectorCrossings, CROSSING_SHADOW_DEFAULTS, crossingShadowExtent } from './connectorCrossings';
import { layoutFlow, METRICS } from './layout';
import {
  addSheet,
  childrenOf,
  createChild,
  createRoot,
  createSibling,
  deleteCell,
  deleteSheet,
  ensureSheet,
  linkCells,
  observeFlow,
  ORIGIN_LOCAL,
  readFlow,
  renameSheet,
  rootsOf,
  setSheetSide,
  sheetOrder,
  sheetsMap,
  unlinkCell,
  yCells,
  yText,
  type FlowCell,
  type FlowSheetData,
} from './model';
import { columnGeometry, GAP_PX } from './columns';
import { Flow2Canvas } from './Flow2Canvas';
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

export function Flow2Editor({
  ydoc,
  provider,
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
  const sheets = useFlow(ydoc);
  const undo = useUndo(ydoc);
  const [activeId, setActiveId] = useState<string | null>(null);
  const sheet = sheets.find((s) => s.id === activeId) ?? sheets[0] ?? null;
  const [mode, setMode] = useState<'canvas' | 'page'>(() => {
    try {
      return localStorage.getItem('pp-flow2-view') === 'page' ? 'page' : 'canvas';
    } catch {
      return 'canvas';
    }
  });
  const [fly, setFly] = useState<{ id: string; n: number } | null>(null);
  const setViewMode = (m: 'canvas' | 'page') => {
    setMode(m);
    try {
      localStorage.setItem('pp-flow2-view', m);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    const on = () => {
      try {
        setMode(localStorage.getItem('pp-flow2-view') === 'page' ? 'page' : 'canvas');
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('pp-flow2-view', on);
    return () => window.removeEventListener('pp-flow2-view', on);
  }, []);

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
  const goTo = (id: string) => {
    setActiveId(id);
    setFly((f) => ({ id, n: (f?.n ?? 0) + 1 }));
  };
  return (
    <div className="flow-wrap f2" data-flow-theme={theme}>
      {mode === 'canvas' ? (
        <>
          <NavBar doc={ydoc} sheets={sheets} activeId={sheet.id} onGo={goTo} mode={mode} onMode={setViewMode} />
          <Flow2Canvas
            doc={ydoc}
            sheets={sheets}
            activeId={sheet.id}
            onActive={setActiveId}
            fly={fly}
            renderLive={(s, zoom) => <SheetView doc={ydoc} sheets={sheets} sheet={s} undo={undo} onPick={goTo} embedded={{ zoom }} />}
          />
        </>
      ) : (
        <>
          <SheetView key={sheet.id} doc={ydoc} sheets={sheets} sheet={sheet} undo={undo} onPick={setActiveId} />
        </>
      )}
    </div>
  );
}

/** The canvas's top bar: a tab per sheet (click to fly there), new sheets, colors, and the view switch. */
function NavBar({ doc, sheets, activeId, onGo, mode, onMode }: { doc: Y.Doc; sheets: FlowSheetData[]; activeId: string; onGo: (id: string) => void; mode: 'canvas' | 'page'; onMode: (m: 'canvas' | 'page') => void }) {
  return (
    <div className="sheet-tabs" role="tablist" aria-label="Sheets">
      {sheets.map((s) => (
        <button key={s.id} type="button" role="tab" aria-selected={s.id === activeId} className={`sheet-tab fl-${s.side}` + (s.id === activeId ? ' is-on' : '')} title={`Go to ${s.name || 'Untitled'}`} onClick={() => onGo(s.id)}>
          <span className="sheet-dot" />
          <span className="sheet-name">{s.name || 'Untitled'}</span>
        </button>
      ))}
      <button type="button" className="btn ghost small" onClick={() => onGo(addSheet(doc, 'gov'))}>
        <IconPlus /> Gov
      </button>
      <button type="button" className="btn ghost small" onClick={() => onGo(addSheet(doc, 'opp'))}>
        <IconPlus /> Opp
      </button>
      <span className="tb-spacer" />
      <ColorsButton />
      <button type="button" className="btn ghost small" aria-pressed={mode === 'page'} title="Show one sheet at a time, filling the window" onClick={() => onMode(mode === 'canvas' ? 'page' : 'canvas')}>
        {mode === 'canvas' ? 'Page view' : 'Canvas'}
      </button>
    </div>
  );
}

// ---------- Sheet tabs and tools ----------

function Tabs({ doc, sheets, sheet, onPick, tools }: { doc: Y.Doc; sheets: FlowSheetData[]; sheet: FlowSheetData; onPick: (id: string) => void; tools: ReactNode }) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => setConfirm(false), [sheet.id]);
  return (
    <div className="sheet-tabs" role="tablist" aria-label="Sheets">
      {sheets.map((s) =>
        renaming === s.id ? (
          <input
            key={s.id}
            className="sheet-rename"
            autoFocus
            defaultValue={s.name}
            aria-label="Sheet name"
            onBlur={(e) => {
              renameSheet(doc, s.id, e.target.value.trim());
              setRenaming(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') setRenaming(null);
            }}
          />
        ) : (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={s.id === sheet.id}
            className={`sheet-tab fl-${s.side}` + (s.id === sheet.id ? ' is-on' : '')}
            title={`${s.name || 'Untitled'} (double-click to rename)`}
            onClick={(e) => (e.detail >= 2 ? setRenaming(s.id) : onPick(s.id))}
          >
            <span className="sheet-dot" />
            <span className="sheet-name">{s.name || 'Untitled'}</span>
          </button>
        ),
      )}
      <label className="sheet-side" title="Whose sheet this is (can only change while the sheet is empty)">
        <span className="sr-only">Side of this sheet</span>
        <select value={sheet.side} disabled={sheet.cells.length > 0} onChange={(e) => setSheetSide(doc, sheet.id, e.target.value as 'gov' | 'opp')}>
          <option value="gov">Gov sheet</option>
          <option value="opp">Opp sheet</option>
        </select>
      </label>
      {tools}
      <ColorsButton />
      <button
        type="button"
        className={'btn ghost small sheet-delete' + (confirm ? ' confirm' : '')}
        title="Delete this sheet and everything on it (Undo brings it back)"
        disabled={sheets.length < 2}
        onClick={() => {
          if (!confirm && sheet.cells.some((c) => c.text.trim())) return setConfirm(true);
          setConfirm(false);
          deleteSheet(doc, sheet.id);
          onPick(sheets.find((s) => s.id !== sheet.id)!.id);
        }}
      >
        {confirm ? `Delete “${sheet.name || 'Untitled'}” and everything on it?` : 'Delete sheet'}
      </button>
      <span className="tb-spacer" />
      <button type="button" className="btn ghost small" title="Show every sheet on one canvas" onClick={() => { try { localStorage.setItem('pp-flow2-view', 'canvas'); } catch { /* ignore */ } window.dispatchEvent(new Event('pp-flow2-view')); }}>
        Canvas
      </button>
      <button type="button" className="btn ghost small" onClick={() => onPick(addSheet(doc, 'gov'))}>
        <IconPlus /> Gov
      </button>
      <button type="button" className="btn ghost small" onClick={() => onPick(addSheet(doc, 'opp'))}>
        <IconPlus /> Opp
      </button>
    </div>
  );
}

// ---------- The sheet ----------

type Focus = { id: string; at: 'start' | 'end' };

export interface Embedded {
  /** Canvas zoom (the sheet is drawn scaled; mouse positions are divided by it). */
  zoom: number;
}

export function SheetView({ doc, sheets, sheet, undo, onPick, embedded }: { doc: Y.Doc; sheets: FlowSheetData[]; sheet: FlowSheetData; undo: Y.UndoManager; onPick: (id: string) => void; embedded?: Embedded }) {
  const scroll = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1000);
  const [heights, setHeights] = useState<ReadonlyMap<string, number>>(new Map());
  const [focusId, setFocusId] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [linking, setLinking] = useState<{ ids: string[]; col: number } | null>(null);
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const want = useRef<Focus | null>(null);
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

  const layout = useMemo(() => layoutFlow(cells, heights, embedded ? { ...METRICS, ghostRows: 6 } : METRICS), [cells, heights, embedded]);
  const top = (c: FlowCell) => layout.tops.get(c.id) ?? 0;
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
    if (key === 'ArrowUp' && atStart) {
      const prev = colList(c.col).filter((k) => top(k) < top(c) - 0.5).at(-1);
      if (prev) {
        e.preventDefault();
        focusCell(prev.id, 'end');
      }
    } else if (key === 'ArrowDown' && atEnd) {
      const next = colList(c.col).find((k) => top(k) > top(c) + 0.5);
      if (next) {
        e.preventDefault();
        focusCell(next.id, 'start');
      }
    } else if (key === 'ArrowLeft' && atStart && c.parent) {
      e.preventDefault();
      focusCell(c.parent, 'end');
    } else if (key === 'ArrowRight' && atEnd) {
      const kid = childrenOf(cells, c.id)[0];
      if (kid) {
        e.preventDefault();
        focusCell(kid.id, 'start');
      }
    }
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
  const rectOf = (c: FlowCell) => ({ left: colX[c.col - 1], right: colX[c.col - 1] + colW[c.col - 1], top: top(c), bottom: top(c) + (layout.heights.get(c.id) ?? 30) });
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

  const tools = <LinkButtons linking={!!linking} canUnlink={!!focused?.parent} onToggle={() => toggleLinking(focusId ?? undefined)} onUnlink={() => focused && unlinkCell(doc, sheet.id, focused.id)} />;
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
          {empty && <div className="f2-hint">Click here, or press Enter, to start. Tab moves to the next speech.</div>}
          <svg className="f2-threads" aria-hidden="true" focusable="false">
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
              linkingFrom={!!linking?.ids.includes(c.id)}
              linkable={!!linking && c.col === linking.col - 1}
              want={want}
              onHeight={onHeight}
              onFocus={() => setFocusId(c.id)}
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
          {marquee && <div className="f2-marquee" style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }} />}
        </div>
      </div>
  );
  if (embedded) {
    return (
      <div className="f2-window-body" data-linking={linking ? 'true' : undefined}>
        <WindowBar doc={doc} sheet={sheet} tools={tools} canDelete={sheets.length > 1} onDeleted={() => onPick(sheets.find((s) => s.id !== sheet.id)!.id)} />
        {body}
      </div>
    );
  }
  return (
    <>
      <Tabs doc={doc} sheets={sheets} sheet={sheet} onPick={onPick} tools={tools} />
      <div className="f2-scroll" ref={scroll} data-linking={linking ? 'true' : undefined}>
        {body}
      </div>
    </>
  );
}

/** A sheet's title bar on the canvas: drag it to move the sheet; name, side, Link and delete live here. */
function WindowBar({ doc, sheet, tools, canDelete, onDeleted }: { doc: Y.Doc; sheet: FlowSheetData; tools: ReactNode; canDelete: boolean; onDeleted: () => void }) {
  const [renaming, setRenaming] = useState(false);
  const [confirm, setConfirm] = useState(false);
  return (
    <div className={`f2-window-bar fl-${sheet.side}`} data-window-handle>
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
        <span className="f2-window-name" onDoubleClick={() => setRenaming(true)} title="Drag to move this sheet; double-click to rename">
          {sheet.name || 'Untitled'}
        </span>
      )}
      <select className="f2-window-side" value={sheet.side} disabled={sheet.cells.length > 0} aria-label="Side of this sheet" title="Whose sheet this is (can only change while the sheet is empty)" onChange={(e) => setSheetSide(doc, sheet.id, e.target.value as 'gov' | 'opp')}>
        <option value="gov">Gov</option>
        <option value="opp">Opp</option>
      </select>
      <span className="tb-spacer" />
      {tools}
      <button
        type="button"
        className={'btn ghost small sheet-delete' + (confirm ? ' confirm' : '')}
        disabled={!canDelete}
        title="Delete this sheet and everything on it (Undo brings it back)"
        onClick={() => {
          if (!confirm && sheet.cells.some((c) => c.text.trim())) return setConfirm(true);
          deleteSheet(doc, sheet.id);
          onDeleted();
        }}
      >
        {confirm ? 'Delete it?' : 'Delete'}
      </button>
    </div>
  );
}

function LinkButtons({ linking, canUnlink, onToggle, onUnlink }: { linking: boolean; canUnlink: boolean; onToggle: () => void; onUnlink: () => void }) {
  return (
    <>
      <button type="button" className={'btn ghost small link-btn' + (linking ? ' is-on' : '')} aria-pressed={linking} title="Link the selected cells to the argument they answer (Ctrl/⌘+Shift+L)" onMouseDown={(e) => e.preventDefault()} onClick={onToggle}>
        <IconThread /> {linking ? 'Cancel link' : 'Link'}
      </button>
      {linking && <span className="link-hint">Click the argument these answer (Esc cancels)</span>}
      {canUnlink && !linking && (
        <button type="button" className="btn ghost small" title="Unlink this cell from the argument it answers" onMouseDown={(e) => e.preventDefault()} onClick={onUnlink}>
          Unlink
        </button>
      )}
    </>
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
    const off = bindText(el, text);
    el.addEventListener('input', fit);
    el.addEventListener('flow2-remote', fit);
    fit();
    return () => {
      off();
      el.removeEventListener('input', fit);
      el.removeEventListener('flow2-remote', fit);
    };
  }, [doc, sheetId, cell.id, fit]);

  // A cell's height depends on its width.
  useLayoutEffect(fit, [w, fit]);

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
      className={`f2-cell fl-${side}` + (lit ? ' is-lit' : '') + (picked ? ' is-picked' : '') + (linkingFrom ? ' is-linking' : '') + (linkable ? ' is-linkable' : '') + (measured ? '' : ' is-measuring')}
      style={{ left: x, top: y, width: w }}
      onMouseDown={(e) => onMouseDown(e, cell)}
    >
      <textarea ref={area} rows={1} spellCheck aria-label="Cell" onFocus={onFocus} onKeyDown={(e) => onKeyDown(e, cell)} />
    </div>
  );
}

function sheetsMapGet(doc: Y.Doc, id: string): Y.Map<unknown> {
  return sheetsMap(doc).get(id)!;
}
