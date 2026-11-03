import { useEffect, useRef, useState } from 'react';

// Side panels (doc list, pins, outline) can be dragged wider or narrower, so
// students on small laptops can give the docs as much room as possible.
// Widths are saved per browser. Dragging far past the narrowest width closes
// the panel; double-clicking the handle puts the width back.

/** A panel width saved in this browser. */
export function usePanelWidth(key: string, initial: number, min: number, max: number) {
  const storageKey = `pp-width-${key}`;
  const [width, setWidth] = useState(() => {
    try {
      const v = Number(localStorage.getItem(storageKey));
      return v >= min && v <= max ? v : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, String(width));
    } catch {
      // ignore
    }
  }, [storageKey, width]);
  return { width, setWidth, min, max, initial };
}

type PanelWidth = ReturnType<typeof usePanelWidth>;

/** How far past the narrowest width a drag has to go to close the panel. */
const CLOSE_PAST = 70;

/**
 * The drag handle on a panel's inner edge. `edge` is the side of the panel
 * the handle sits on: a doc list on the left of the screen has its handle on
 * its right edge.
 */
export function PanelHandle({ panel, edge, label, onCollapse }: { panel: PanelWidth; edge: 'left' | 'right'; label: string; onCollapse?: () => void }) {
  const [closing, setClosing] = useState(false);
  const startRef = useRef<{ x: number; w: number } | null>(null);
  const dir = edge === 'right' ? 1 : -1;

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    startRef.current = { x: e.clientX, w: panel.width };
    document.body.classList.add('is-resizing');
    let willClose = false;
    const move = (ev: PointerEvent) => {
      const s = startRef.current;
      if (!s) return;
      const raw = s.w + (ev.clientX - s.x) * dir;
      willClose = !!onCollapse && raw < panel.min - CLOSE_PAST;
      setClosing(willClose);
      panel.setWidth(Math.round(Math.min(panel.max, Math.max(panel.min, raw))));
    };
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
      document.body.classList.remove('is-resizing');
      setClosing(false);
      if (willClose && startRef.current) {
        // Close it, and open it again at the width it had before the drag.
        panel.setWidth(startRef.current.w);
        onCollapse?.();
      }
      startRef.current = null;
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 64 : 16;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const grow = (e.key === 'ArrowRight' ? 1 : -1) * dir;
      panel.setWidth((w) => Math.min(panel.max, Math.max(panel.min, w + grow * step)));
    } else if (e.key === 'Home') {
      e.preventDefault();
      panel.setWidth(panel.initial);
    }
  };

  return (
    <div
      className={`panel-handle edge-${edge}` + (closing ? ' is-closing' : '')}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={panel.min}
      aria-valuemax={panel.max}
      aria-valuenow={panel.width}
      tabIndex={0}
      title={`Drag to resize${onCollapse ? ', or drag all the way in to close' : ''}. Double-click to reset.`}
      onPointerDown={onPointerDown}
      onDoubleClick={() => panel.setWidth(panel.initial)}
      onKeyDown={onKeyDown}
    />
  );
}
