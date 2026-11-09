// How a wheel or trackpad gesture moves the canvas: scrolling pans, pinching (or Ctrl/⌘ + wheel) zooms.
//
// Adapted from Flowist (by Elli; used with permission): sheet/canvas-wheel.ts, unchanged but for its import.
import type { Point } from './canvasGeometry';

export type WheelInput = Pick<WheelEvent, 'deltaX' | 'deltaY' | 'deltaMode' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'clientX' | 'clientY'>;

type WheelIntent =
  | { kind: 'pan'; dx: number; dy: number }
  | { kind: 'zoom'; factor: number; anchor: Point };

const WHEEL_ZOOM_SENSITIVITY = 0.002;

const DOM_DELTA_LINE = 1;
const DOM_DELTA_PAGE = 2;

export function readWheelIntent(event: WheelInput, viewportHeight: number, scales: { pan?: number; zoom?: number } = {}): WheelIntent {
  const { pan: panScale = 1, zoom: zoomScale = 1 } = scales;
  const unit = event.deltaMode === DOM_DELTA_LINE ? 16
    : event.deltaMode === DOM_DELTA_PAGE ? viewportHeight : 1;
  const dx = event.deltaX * unit;
  const dy = event.deltaY * unit;
  if (event.ctrlKey || event.metaKey) {
    return {
      kind: 'zoom',
      factor: Math.exp(-dy * WHEEL_ZOOM_SENSITIVITY * zoomScale),
      anchor: { x: event.clientX, y: event.clientY },
    };
  }
  if (event.shiftKey) {
    const horizontal = Math.abs(dx) >= Math.abs(dy) ? dx : dy;
    return { kind: 'pan', dx: -horizontal * panScale || 0, dy: 0 };
  }
  return { kind: 'pan', dx: -dx * panScale || 0, dy: -dy * panScale || 0 };
}
