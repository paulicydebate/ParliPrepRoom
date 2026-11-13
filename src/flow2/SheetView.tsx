import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, Fragment, useId } from 'react';
import * as Y from 'yjs';
import { toast } from '../editor/roundGuard';
import { SPEECH_INFO } from '../model/speeches';
import { IconChevronDown, IconChevronRight, IconPin } from '../ui/icons';
import { connectorPath, routeBetween, type ConnectorPath } from './connectors';
import { connectorCrossings, CROSSING_SHADOW_DEFAULTS, crossingShadowExtent } from './connectorCrossings';
import { layoutFlow, METRICS } from './layout';
import {
  addRef,
  childrenOf,
  createChild,
  createRoot,
  createSibling,
  deleteCell,
  groupCells,
  ungroupCells,
  linkCells,
  removeRef,
  rootsOf,
  setMark,
  unlinkCell,
  type FlowCell,
  type FlowMark,
  type FlowRef,
  type FlowSheetData,
} from './model';
import { columnGeometry, GAP_PX, PINS_PX, WIDE_MIN_PX } from './columns';
import { PinColumn } from './PinColumn';
import { useRoundMode } from '../store/roundMode';
import { directionalTarget } from './directionalTarget';
import { type Peer } from './flowHooks';
import { WindowBar } from './WindowBar';
import { Cell } from './Cell';
import { RefPicker } from './RefPicker';

// One sheet: its columns, cells, link lines, box-select, link mode and the keys inside a cell. Interaction design
// adapted from Flowist (by Elli, used with permission); the code is this app's own.

const jumpsTaken = new WeakSet<object>();

export type Focus = { id: string; at: 'start' | 'end' };

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

export function SheetView({ space, doc, sheets, sheet, undo, onPick: _onPick, embedded, maximized, jump, onJump, docId, peers, onCellFocus, onDock }: { space: string; onDock?: (sheetId: string, dock: Dock | null) => void; docId: string; peers: ReadonlyMap<string, Peer[]>; onCellFocus: (cell: string | null, at?: number, end?: number) => void; doc: Y.Doc; sheets: FlowSheetData[]; sheet: FlowSheetData; undo: Y.UndoManager; onPick: (id: string) => void; embedded?: Embedded; maximized?: Maximized; jump?: Jump | null; onJump?: (sheetId: string, cellId: string) => void }) {
  const scroll = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1000);
  const [heights, setHeights] = useState<ReadonlyMap<string, number>>(new Map());
  const [focusId, setFocusId] = useState<string | null>(null);
  // Counts every time a cell here takes the caret, so the toolbar follows you back to a sheet you were on before.
  const [focusTick, setFocusTick] = useState(0);
  const [picked, setPicked] = useState<string[]>([]);
  const [linking, setLinking] = useState<{ ids: string[]; col: number } | null>(null);
  // Esc cancels linking wherever the caret is (the hint says so), not only from inside a cell.
  useEffect(() => {
    if (!linking) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLinking(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [linking]);
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const want = useRef<Focus | null>(null);
  const heldBackspace = useRef(false);
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
  // Minimized columns are this window's view, not part of the shared flow.
  const minKey = `pp-flow2-cols-${docId}-${sheet.id}`;
  const [minCols, setMinCols] = useState<number[]>(() => {
    try {
      return (JSON.parse(localStorage.getItem(minKey) ?? '[]') as number[]).filter((n) => Number.isInteger(n));
    } catch {
      return [];
    }
  });
  const setMini = (col: number, on: boolean) => {
    if (on && document.activeElement instanceof HTMLElement && document.activeElement.closest('.f2-cell')) document.activeElement.blur();
    setMinCols((prev) => {
      const next = on ? [...new Set([...prev, col])] : prev.filter((c) => c !== col);
      try {
        localStorage.setItem(minKey, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };
  // The pins column: opens after the speech column whose pin button was pressed (also this window's own view).
  const pinKey = `pp-flow2-pincol-${docId}-${sheet.id}`;
  const roundMode = useRoundMode();
  const [pinCol, setPinCol] = useState<number | null>(() => {
    try {
      const n = Number(localStorage.getItem(pinKey));
      return Number.isInteger(n) && n >= 1 && n <= sheet.columns.length ? n : null;
    } catch {
      return null;
    }
  });
  const togglePinCol = (col: number) =>
    setPinCol((cur) => {
      const next = cur === col ? null : col;
      try {
        if (next) localStorage.setItem(pinKey, String(next));
        else localStorage.removeItem(pinKey);
      } catch {
        /* ignore */
      }
      return next;
    });
  const geo = columnGeometry(sheet, focused?.col ?? null, embedded ? null : width, minCols, pinCol);
  const { used, mini, colX, colW, inner, pinX } = geo;
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
    const col = byId.get(id)?.col;
    if (col && minCols.includes(col)) setMini(col, false);
    want.current = { id, at };
    bump((n) => n + 1);
  };

  useEffect(() => {
    // Each jump is taken once: a sheet that is drawn again later (panned back into view, expanded) must not grab the caret.
    if (jump && !jumpsTaken.has(jump) && jump.sheetId === sheet.id && byId.has(jump.cellId)) {
      jumpsTaken.add(jump);
      focusCell(jump.cellId, 'end');
    }
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
    // While an input method is composing (Japanese, Chinese, Korean, accents), Enter, Tab and the arrows belong to it.
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === 'Backspace' && e.repeat && heldBackspace.current) {
      e.preventDefault();
      return;
    }
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
      // A held key stops at the empty cell: it must not delete cell after cell, or run on into the text of the cell above.
      if (e.repeat) return;
      heldBackspace.current = true;
      window.addEventListener('keyup', () => (heldBackspace.current = false), { once: true });
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
    // Between columns (beside the pins column) or past the end: the nearest one.
    let best = 0;
    for (let i = 1; i < colX.length; i++) if (Math.abs(px - (colX[i] + colW[i] / 2)) < Math.abs(px - (colX[best] + colW[best] / 2))) best = i;
    return best + 1;
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
            if (mini[c.col - 1]) return false;
            const cx = colX[c.col - 1];
            const cy = top(c);
            return cx + colW[c.col - 1] >= box.x && cx <= box.x + box.w && cy + (layout.heights.get(c.id) ?? 0) >= box.y && cy <= box.y + box.h;
          })
          .map((c) => c.id),
      );
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('blur', cancel);
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
    // Leaving the window mid-drag (Alt+Tab) ends the box without adding a cell.
    const cancel = () => {
      moved = true;
      up();
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    window.addEventListener('blur', cancel);
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
    .filter((c) => c.parent && byId.has(c.parent) && layout.tops.has(c.id) && layout.tops.has(c.parent) && !mini[c.col - 1] && !mini[byId.get(c.parent)!.col - 1])
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
  }, [flagsKey, focusId, focusTick, sheet.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onDock?.(sheet.id, null), [sheet.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const body = (
      <div className="f2-inner" style={{ width: inner }}>
        <div className="f2-head">
          {sheet.columns.map((s, i) => (
            <div key={s} className={`flow-col-head fl-${SPEECH_INFO[s].side}` + (used[i] ? '' : ' is-narrow') + (mini[i] ? ' is-mini' : '')} style={{ left: colX[i], width: colW[i] }} title={SPEECH_INFO[s].name}>
              {!mini[i] && <span>{s}</span>}
              {!mini[i] && (
                <button
                  type="button"
                  className={'f2-col-toggle f2-col-pin' + (pinCol === i + 1 ? ' is-on' : '')}
                  aria-label={pinCol === i + 1 ? `Close the pins column after ${s}` : `Show pinned blocks after ${s}`}
                  aria-pressed={pinCol === i + 1}
                  title={pinCol === i + 1 ? 'Close the pins column' : 'Show your pinned blocks for this sheet in a column after this one'}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => togglePinCol(i + 1)}
                >
                  <IconPin />
                </button>
              )}
              <button
                type="button"
                className="f2-col-toggle"
                aria-label={mini[i] ? `Expand ${s}` : `Minimize ${s}`}
                aria-expanded={!mini[i]}
                title={mini[i] ? `Expand ${SPEECH_INFO[s].name}` : `Minimize ${SPEECH_INFO[s].name}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setMini(i + 1, !mini[i])}
              >
                {mini[i] ? <IconChevronRight /> : <IconChevronDown />}
              </button>
            </div>
          ))}
        </div>
        {pinX !== null && (
          <div className="flow-col-head f2-pins-head" style={{ left: pinX, width: PINS_PX }}>
            <span>Pins</span>
          </div>
        )}
        <div className="f2-canvas" ref={canvas} style={{ height: total }} onMouseDown={onBackground}>
          {pinX !== null && (
            <div className="f2-pins-wrap" style={{ left: pinX, width: PINS_PX, height: total }} onMouseDown={(e) => e.stopPropagation()}>
              <PinColumn space={space} sheetName={sheet.name} hostKey={`${docId}:${sheet.id}`} roundMode={roundMode} />
            </div>
          )}
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
              w={mini[c.col - 1] ? WIDE_MIN_PX : colW[c.col - 1] ?? 100}
              hidden={mini[c.col - 1]}
              y={top(c)}
              side={sideOf(c.col)}
              label={`${SPEECH_INFO[sheet.columns[c.col - 1]].name}${c.parent && byId.get(c.parent)?.text.trim() ? `, answers: ${byId.get(c.parent)!.text.trim().slice(0, 60)}` : ''}`}
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
                setFocusTick((n) => n + 1);
                onCellFocus(c.id, (document.activeElement as HTMLTextAreaElement | null)?.selectionStart ?? undefined);
              }}
              onCaret={(at, end) => onCellFocus(c.id, at, end)}
              onBlur={() => setTimeout(() => !document.activeElement?.closest('.f2-cell') && onCellFocus(null), 60)}
              onKeyDown={onCellKey}
              onMouseDown={onCellMouseDown}
            />
          ))}
          {adds.filter((k) => !mini[k.col - 1]).map((k) => (
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
            .filter((c) => childrenOf(cells, c.id).length === 0 && c.col < sheet.columns.length && !mini[c.col - 1] && !mini[c.col] && layout.tops.has(c.id) && !(linking || marquee))
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
      docId={docId}
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

