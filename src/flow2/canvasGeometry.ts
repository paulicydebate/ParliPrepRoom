// Camera and placement maths for the canvas of sheets.
//
// Adapted from Flowist (by Elli; used with permission): workspace/layout/canvas-geometry.ts. The functions
// are Flowist's; its two zoom limits (workspace/model/canvas-view.ts) are written in here, and the
// functions this app has no use for yet (placement areas, covered views) are left out.

export const MIN_MANUAL_CANVAS_ZOOM = 0.25;
export const MAX_CANVAS_ZOOM = 2;
export type Point = { x: number; y: number };
export type Size = { width: number; height: number };
export type WorldRect = Point & Size;
export type Camera = Point & { zoom: number };
export type View = Size & Partial<Point>;
export type Cover = { left: number; right: number };

export const MIN_ZOOM = MIN_MANUAL_CANVAS_ZOOM;
export const MAX_ZOOM = MAX_CANVAS_ZOOM;
export const DEFAULT_ZOOM = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, 1));
export const SHEET_GAP = 48;
export const DEFAULT_SHEET_SIZE: Size = { width: 880, height: 580 };
const ZOOM_STEPS = [
  MIN_ZOOM,
  ...[0.15, 0.2, 0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75]
    .filter((step) => step > MIN_ZOOM && step < MAX_ZOOM),
  MAX_ZOOM,
];

export function stepZoom(zoom: number, direction: 'in' | 'out'): number {
  if (direction === 'in') return ZOOM_STEPS.find((step) => step > zoom) ?? MAX_ZOOM;
  for (let index = ZOOM_STEPS.length - 1; index >= 0; index -= 1) {
    const step = ZOOM_STEPS[index]!;
    if (step < zoom) return step;
  }
  return Math.min(MIN_ZOOM, zoom);
}

export function uncoveredView(size: Size, cover: Cover): View & Point {
  const left = Math.min(Math.max(0, cover.left), Math.max(0, size.width - 1));
  const right = Math.min(Math.max(0, cover.right), Math.max(0, size.width - 1 - left));
  return { x: left, y: 0, width: size.width - left - right, height: size.height };
}

export function viewCenter(view: View): Point {
  return { x: (view.x ?? 0) + view.width / 2, y: (view.y ?? 0) + view.height / 2 };
}

export function centeredCamera(view: View): Camera {
  const { x, y } = viewCenter(view);
  return { x: Math.round(x), y: Math.round(y), zoom: DEFAULT_ZOOM };
}

export function viewportToWorld(point: Point, camera: Camera): Point {
  return {
    x: (point.x - camera.x) / camera.zoom,
    y: (point.y - camera.y) / camera.zoom,
  };
}

/** Moves the camera just far enough to show `rect` in `view`, and once it has to move, into `room` instead when given. */
export function revealCamera(camera: Camera, rect: WorldRect, view: View, room?: View): Camera {
  const shift = (start: number, size: number, from: number, span: number) => {
    if (size > span) return start > from ? from - start : Math.max(0, from + span - (start + size));
    if (start < from) return from - start;
    return Math.min(0, from + span - (start + size));
  };
  const dx = shift(camera.x + rect.x * camera.zoom, rect.width * camera.zoom, view.x ?? 0, view.width);
  const dy = shift(camera.y + rect.y * camera.zoom, rect.height * camera.zoom, view.y ?? 0, view.height);
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return camera;
  return room ? revealCamera(camera, rect, room) : { ...camera, x: camera.x + dx, y: camera.y + dy };
}

export function nextSheetPosition(sheets: readonly WorldRect[]): Point {
  if (sheets.length === 0) return { x: 0, y: 0 };
  return {
    x: Math.max(...sheets.map((rect) => rect.x + rect.width)) + SHEET_GAP,
    y: Math.min(...sheets.map((rect) => rect.y)),
  };
}

export function fitPadding(viewport: Size): number {
  return Math.min(48, viewport.width / 10, viewport.height / 10);
}

export function sheetTitlebarHeight(zoom: number): number {
  return Math.max(20, 12 / Math.max(MIN_ZOOM, zoom)) * 1.5 + 10;
}

export type PlacementArea = {
  view: View;
  step: number;
  /**
   * The board (canvas/camera/canvas-edge.ts), where the canvas has one: an added sheet goes in the part
   * of the view on it, and its titlebar always lands on it, as a drag's limits keep it (`titlebarLimits`),
   * so adding a sheet never grows the board. `rise` is how far above its corner the titlebar draws below
   * 60% zoom.
   */
  board?: WorldRect | null;
  rise?: number;
};

const spanOf = (start: number, extent: number) => ({ min: Math.min(start, start + extent), max: Math.max(start, start + extent) });
const within = (value: number, { min, max }: { min: number; max: number }) => Math.min(max, Math.max(min, value));

export function addedSheetPosition({ size, others, camera, view, step, board, rise = 0 }: PlacementArea & {
  size: Size;
  others: readonly WorldRect[];
  camera: Camera;
}): Point {
  const { zoom } = camera;
  const padding = fitPadding(view) / zoom;
  let left = ((view.x ?? 0) - camera.x) / zoom;
  let top = ((view.y ?? 0) - camera.y) / zoom;
  let right = left + view.width / zoom;
  let bottom = top + view.height / zoom;
  // Where the corner may rest for the titlebar to stay on the board: the whole width, and the
  // titlebar's height as drawn (`step`) from `rise` above the corner.
  const keep = board ? { x: spanOf(board.x, board.width - size.width), y: spanOf(board.y + rise, board.height - step) } : null;
  if (board) {
    left = Math.max(left, board.x);
    top = Math.max(top, board.y);
    right = Math.min(right, board.x + board.width);
    bottom = Math.min(bottom, board.y + board.height);
  }
  const kept = ({ x, y }: Point) => keep ? { x: within(x, keep.x), y: within(y, keep.y) } : { x, y };
  const start = kept({
    x: left + Math.max(padding, (right - left - size.width) / 2),
    y: top + Math.max(padding, (bottom - top - size.height) / 2),
  });
  const rounded = ({ x, y }: Point) => kept({ x: Math.round(x), y: Math.round(y) });
  if (!(step >= 1)) return rounded(start);
  const rightmost = Math.max(start.x, Math.min(right - padding - size.width, keep?.x.max ?? Infinity));
  const inTheWay = (rect: WorldRect, spot: Point, overlapping: boolean) => Math.abs(rect.y - spot.y) < step
    && rect.x > (overlapping ? spot.x - rect.width : spot.x - step / 2) && rect.x < spot.x + size.width;
  for (let x = start.x; x <= rightmost; x += step) {
    let spot = { x, y: start.y };
    const passed = new Set<WorldRect>();
    while (spot.y + step <= bottom - padding) {
      const lowest = others.reduce<WorldRect | undefined>((found, rect) => !passed.has(rect)
        && inTheWay(rect, spot, x === start.x) && (!found || rect.y > found.y) ? rect : found, undefined);
      if (!lowest) return rounded(spot);
      passed.add(lowest);
      spot = { x: Math.min(rightmost, Math.max(spot.x, lowest.x + step)), y: lowest.y + step };
    }
  }
  return rounded(start);
}

export function zoomAt(camera: Camera, anchor: Point, zoom: number): Camera {
  const nextZoom = Math.min(MAX_ZOOM, Math.max(Math.min(MIN_ZOOM, camera.zoom), zoom));
  const world = viewportToWorld(anchor, camera);
  return {
    x: anchor.x - world.x * nextZoom,
    y: anchor.y - world.y * nextZoom,
    zoom: nextZoom,
  };
}

export function isWorldRectNearViewport(
  rect: WorldRect,
  camera: Camera,
  viewport: Size,
  overscan = 0,
): boolean {
  const margin = Math.max(0, overscan);
  const left = rect.x * camera.zoom + camera.x;
  const top = rect.y * camera.zoom + camera.y;
  const right = (rect.x + rect.width) * camera.zoom + camera.x;
  const bottom = (rect.y + rect.height) * camera.zoom + camera.y;

  return right >= -margin
    && bottom >= -margin
    && left <= viewport.width + margin
    && top <= viewport.height + margin;
}
