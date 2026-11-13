import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type * as Y from 'yjs';
import { SPEECH_INFO } from '../model/speeches';
import {
  isWorldRectNearViewport,
  MAX_CANVAS_ZOOM,
  MIN_MANUAL_CANVAS_ZOOM,
  nextSheetPosition,
  stepZoom,
  zoomAt,
  type Camera,
  type WorldRect,
} from './canvasGeometry';
import { readWheelIntent } from './canvasWheel';
import { createTrackpadClock, createTrackpadPath, GESTURE_GAP_MS } from './trackpadPath';
import { columnGeometry } from './columns';
import { layoutFlow, METRICS } from './layout';
import { moveSheet, type FlowSheetData } from './model';

// All of a flow's sheets on one canvas: scroll to pan, pinch (or Ctrl/⌘ + wheel) to zoom, drag a
// sheet's title bar to move it, drag empty canvas to pan, and the tabs fly to a sheet. Camera maths
// and wheel handling are adapted from Flowist (by Elli; used with permission).

const DEFAULT_SIZE = { width: 900, height: 520 };
/// Below this zoom a sheet is drawn as a light picture instead of live cells.
const LIVE_ZOOM = 0.3;

type Size = { width: number; height: number };

export function Flow2Canvas({
  doc,
  sheets,
  renderLive,
  collapsed,
  renderCollapsed,
  activeId,
  onActive,
  fly,
}: {
  doc: Y.Doc;
  sheets: FlowSheetData[];
  /** Draws a sheet you can edit (the editor supplies it). */
  renderLive: (sheet: FlowSheetData, zoom: number) => React.ReactNode;
  /** Sheets shown as a title bar only. */
  collapsed: ReadonlySet<string>;
  renderCollapsed: (sheet: FlowSheetData) => React.ReactNode;
  activeId: string | null;
  onActive: (id: string) => void;
  /** Ask the canvas to fly to a sheet: change `n` to ask again. */
  fly: { id: string; n: number } | null;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const [camera, setCamera] = useState<Camera>({ x: 16, y: 16, zoom: 1 });
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  const [view, setView] = useState<Size>({ width: 1000, height: 700 });
  const [sizes, setSizes] = useState<ReadonlyMap<string, Size>>(new Map());
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const anim = useRef(0);
  const started = useRef(false);
  // A trackpad pan is drawn along the path its events stamp (Flowist's trackpad-path), not event by event.
  const clock = useRef(createTrackpadClock());
  const path = useRef<ReturnType<typeof createTrackpadPath> | null>(null);
  const pathLoop = useRef(0);
  const lastWheel = useRef(0);
  const stopPath = () => {
    cancelAnimationFrame(pathLoop.current);
    pathLoop.current = 0;
    path.current = null;
  };

  useLayoutEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setView({ width: el.clientWidth, height: el.clientHeight }));
    ro.observe(el);
    setView({ width: el.clientWidth, height: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // Where each sheet sits: where it was put, else beside the one before.
  const rects = useMemo(() => {
    const out = new Map<string, WorldRect>();
    const placed: WorldRect[] = [];
    for (const s of sheets) {
      const size = sizes.get(s.id) ?? DEFAULT_SIZE;
      // Sheets that were never moved line up after the ones before them, by where those rest, not where one is being dragged.
      const rest = { ...(s.x !== null && s.y !== null ? { x: s.x, y: s.y } : nextSheetPosition(placed)), ...size };
      out.set(s.id, drag?.id === s.id ? { x: drag.x, y: drag.y, ...size } : rest);
      placed.push(rest);
    }
    return out;
  }, [sheets, sizes, drag]);

  const setCameraNow = (c: Camera) => {
    stopPath();
    cancelAnimationFrame(anim.current);
    setCamera(c);
  };

  const animateTo = useCallback((to: Camera, ms = 280) => {
    cancelAnimationFrame(pathLoop.current);
    pathLoop.current = 0;
    path.current = null;
    cancelAnimationFrame(anim.current);
    const from = cameraRef.current;
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      const e = 1 - (1 - k) ** 3;
      setCamera({ x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, zoom: from.zoom + (to.zoom - from.zoom) * e });
      if (k < 1) anim.current = requestAnimationFrame(step);
    };
    anim.current = requestAnimationFrame(step);
  }, []);

  /** A camera that shows the whole rect, as large as fits (never more than 100%), with room around it. */
  const cameraFor = useCallback(
    (r: WorldRect): Camera => {
      const pad = Math.min(48, view.width / 10, view.height / 10);
      const zoom = Math.max(MIN_MANUAL_CANVAS_ZOOM, Math.min(1, (view.width - 2 * pad) / r.width, (view.height - 2 * pad) / r.height));
      return {
        zoom,
        x: view.width / 2 - (r.x + r.width / 2) * zoom,
        y: r.height * zoom > view.height - 2 * pad ? pad - r.y * zoom : view.height / 2 - (r.y + r.height / 2) * zoom,
      };
    },
    [view],
  );

  /** A camera with the sheet's top-left corner snapped near the view's top-left, at 100% (or smaller if it is wider than the view). */
  const cornerCamera = useCallback(
    (r: WorldRect): Camera => {
      const pad = 16;
      const zoom = Math.max(MIN_MANUAL_CANVAS_ZOOM, Math.min(1, (view.width - 2 * pad) / r.width));
      return { zoom, x: pad - r.x * zoom, y: pad - r.y * zoom };
    },
    [view],
  );

  // The first time sizes are known, show the first sheet in the corner; later, tabs ask the canvas to fly.
  useEffect(() => {
    const first = sheets[0] && rects.get(sheets[0].id);
    if (!started.current && first && sizes.has(sheets[0].id)) {
      started.current = true;
      setCameraNow(cornerCamera(first));
    }
  }, [sheets, rects, sizes, cornerCamera]);
  useEffect(() => {
    if (!fly) return;
    const r = rects.get(fly.id);
    if (r) animateTo(cornerCamera(r));
  }, [fly?.n]); // eslint-disable-line react-hooks/exhaustive-deps

  // Wheel: scroll pans, pinch zooms about the pointer.
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      // A list inside the canvas (the pins column, the cross-apply picker) scrolls itself when it has more to show.
      const list = (e.target as HTMLElement | null)?.closest?.('.f2-pins-wrap, .f2-picker ul, .f2-picker') as HTMLElement | null;
      if (list && !e.ctrlKey && !e.metaKey && list.scrollHeight > list.clientHeight + 1) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const intent = readWheelIntent(e, rect.height);
      cancelAnimationFrame(anim.current);
      if (intent.kind === 'pan') {
        const now = performance.now();
        const t = clock.current.stamped(e.timeStamp, now);
        lastWheel.current = now;
        const cam = cameraRef.current;
        if (path.current) {
          const n = path.current.newest();
          path.current.add({ x: n.x + intent.dx, y: n.y + intent.dy }, t);
        } else path.current = createTrackpadPath(clock.current, { x: cam.x, y: cam.y }, { x: cam.x + intent.dx, y: cam.y + intent.dy }, t);
        if (!pathLoop.current) {
          const tick = (frame: number) => {
            pathLoop.current = 0;
            const p = path.current;
            if (!p) return;
            const at = p.draw(frame);
            setCamera((c) => ({ ...c, x: at.x, y: at.y }));
            const n = p.newest();
            if (frame - lastWheel.current > GESTURE_GAP_MS * 3 && Math.abs(at.x - n.x) < 0.5 && Math.abs(at.y - n.y) < 0.5) {
              path.current = null;
              return;
            }
            pathLoop.current = requestAnimationFrame(tick);
          };
          pathLoop.current = requestAnimationFrame(tick);
        }
      } else {
        stopPath();
        setCamera((c) => zoomAt(c, { x: intent.anchor.x - rect.left, y: intent.anchor.y - rect.top }, c.zoom * intent.factor));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Drag empty canvas to pan; drag a title bar to move its sheet.
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    const handle = target.closest('[data-window-handle]') as HTMLElement | null;
    if (handle && !target.closest('button, input, select, textarea, [contenteditable]')) {
      const win = handle.closest('[data-sheet-id]') as HTMLElement | null;
      const id = win?.dataset.sheetId;
      const r = id ? rects.get(id) : undefined;
      if (!id || !r) return;
      e.preventDefault();
      onActive(id);
      const x0 = e.clientX;
      const y0 = e.clientY;
      let moved = false;
      const move = (ev: PointerEvent) => {
        const z = cameraRef.current.zoom;
        if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return;
        moved = true;
        setDrag({ id, x: r.x + (ev.clientX - x0) / z, y: r.y + (ev.clientY - y0) / z });
      };
      // A cancelled pointer (a system gesture, a pen leaving) ends the drag where it was, without moving the sheet.
      const end = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', end);
        window.removeEventListener('pointercancel', end);
        if (moved && ev.type === 'pointerup') {
          const z = cameraRef.current.zoom;
          moveSheet(doc, id, r.x + (ev.clientX - x0) / z, r.y + (ev.clientY - y0) / z);
        }
        setDrag(null);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', end);
      window.addEventListener('pointercancel', end);
      return;
    }
    if (target.closest('.f2-window')) return;
    e.preventDefault();
    stopPath();
    cancelAnimationFrame(anim.current);
    const x0 = e.clientX;
    const y0 = e.clientY;
    const c0 = cameraRef.current;
    const move = (ev: PointerEvent) => setCamera({ ...c0, x: c0.x + ev.clientX - x0, y: c0.y + ev.clientY - y0 });
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };

  const reportSize = useCallback((id: string, size: Size) => {
    setSizes((prev) => {
      const old = prev.get(id);
      if (old && Math.abs(old.width - size.width) < 1 && Math.abs(old.height - size.height) < 1) return prev;
      return new Map(prev).set(id, size);
    });
  }, []);

  const fitAll = () => {
    const all = [...rects.values()];
    if (!all.length) return;
    const x = Math.min(...all.map((r) => r.x));
    const y = Math.min(...all.map((r) => r.y));
    const right = Math.max(...all.map((r) => r.x + r.width));
    const bottom = Math.max(...all.map((r) => r.y + r.height));
    animateTo(cameraFor({ x, y, width: right - x, height: bottom - y }));
  };
  useEffect(
    () => () => {
      stopPath();
      cancelAnimationFrame(anim.current);
    },
    [],
  ); // eslint-disable-line react-hooks/exhaustive-deps
  const zoomBy = (dir: 'in' | 'out') => animateTo(zoomAt(cameraRef.current, { x: view.width / 2, y: view.height / 2 }, stepZoom(cameraRef.current.zoom, dir)), 160);

  return (
    <div className="f2-viewport" ref={viewport} onPointerDown={onPointerDown}>
      <div className="f2-world" style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})` }}>
        {sheets.map((s) => {
          const r = rects.get(s.id)!;
          const near = isWorldRectNearViewport(r, camera, view, 400);
          const live = near && camera.zoom >= LIVE_ZOOM;
          return (
            <Window key={s.id} sheet={s} rect={r} active={s.id === activeId} onSize={reportSize} onFocus={() => onActive(s.id)}>
              {collapsed.has(s.id) ? (
                renderCollapsed(s)
              ) : live ? (
                renderLive(s, camera.zoom)
              ) : near ? (
                <SheetPreview sheet={s} />
              ) : (
                <div style={{ width: r.width, height: r.height }} />
              )}
            </Window>
          );
        })}
      </div>
      <div className="f2-zoom" onPointerDown={(e) => e.stopPropagation()}>
        <button type="button" className="icon-btn small" aria-label="Zoom out" disabled={camera.zoom <= MIN_MANUAL_CANVAS_ZOOM + 1e-6} onClick={() => zoomBy('out')}>
          −
        </button>
        <span className="f2-zoom-pct" aria-live="polite">
          {Math.round(camera.zoom * 100)}%
        </span>
        <button type="button" className="icon-btn small" aria-label="Zoom in" disabled={camera.zoom >= MAX_CANVAS_ZOOM - 1e-6} onClick={() => zoomBy('in')}>
          +
        </button>
        <button type="button" className="btn ghost small" onClick={() => activeId && rects.get(activeId) && animateTo(cornerCamera(rects.get(activeId)!))} title="Show the sheet you are on, snapped to the top-left corner">
          Top left
        </button>
        <button type="button" className="btn ghost small" onClick={fitAll} title="Show every sheet">
          Fit all
        </button>
      </div>
    </div>
  );
}

function Window({ sheet, rect, active, onSize, onFocus, children }: { sheet: FlowSheetData; rect: WorldRect; active: boolean; onSize: (id: string, s: Size) => void; onFocus: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const report = () => onSize(sheet.id, { width: el.offsetWidth, height: el.offsetHeight });
    const ro = new ResizeObserver(report);
    ro.observe(el);
    report();
    return () => ro.disconnect();
  }, [sheet.id, onSize]);
  return (
    <div ref={ref} className={`f2-window fl-${sheet.side}` + (active ? ' is-active' : '')} data-sheet-id={sheet.id} style={{ left: rect.x, top: rect.y }} onFocusCapture={onFocus}>
      {children}
    </div>
  );
}

/** A light picture of a sheet, for when it is zoomed out too far to edit. */
export function SheetPreview({ sheet }: { sheet: FlowSheetData }) {
  const geo = columnGeometry(sheet, null, null);
  const heights = new Map(
    sheet.cells.map((c) => {
      const perLine = Math.max(8, Math.floor((geo.colW[c.col - 1] ?? 100) / 6.5));
      return [c.id, 14 + 17 * Math.max(1, Math.ceil(c.text.length / perLine))] as const;
    }),
  );
  const layout = layoutFlow(sheet.cells, heights, { ...METRICS, ghostRows: 3 });
  return (
    <div className="f2-window-body f2-preview">
      <div className={`f2-window-bar fl-${sheet.side}`} data-window-handle>
        <span className="sheet-dot" />
        <span className="f2-window-name">{sheet.name || 'Untitled'}</span>
      </div>
      <div className="f2-inner" style={{ width: geo.inner }}>
        <div className="f2-head">
          {sheet.columns.map((s, i) => (
            <div key={s} className={`flow-col-head fl-${SPEECH_INFO[s].side}` + (geo.used[i] ? '' : ' is-narrow')} style={{ left: geo.colX[i], width: geo.colW[i] }}>
              <span>{s}</span>
            </div>
          ))}
        </div>
        <div className="f2-canvas" style={{ height: layout.total }}>
          {sheet.cells.map((c) => (
            <div key={c.id} className={`f2-cell f2-preview-cell fl-${SPEECH_INFO[sheet.columns[c.col - 1]].side}`} style={{ left: geo.colX[c.col - 1], top: layout.tops.get(c.id), width: geo.colW[c.col - 1], height: layout.heights.get(c.id) }}>
              {c.text}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
