// Where two link lines cross, so the one above can cast a soft shadow on the one beneath.
//
// Adapted from Flowist (by Elli; used with permission): workspace/layout/connector-crossings.ts. The
// geometry is Flowist's; only its settings store (zustand) is replaced by a plain constant.

import type { ConnectorPath } from './connectors';

/** `size`: how far the shadow spreads past the top line's stroke, before `blur` softens it. */
type CrossingShadowOptions = { size: number; blur: number; opacity: number };

export const CROSSING_SHADOW_DEFAULTS: Readonly<CrossingShadowOptions> = { size: 2.5, blur: 2, opacity: 0.75 };


/** How far from the top line's middle its shadow reaches: half a 1.5px line, the spread and three blur radii. */
export const crossingShadowExtent = ({ size, blur }: Readonly<CrossingShadowOptions>) => 0.75 + size + 3 * blur;

/**
 * Where two link lines cross: the stretch of each line around the junction, one casting the shadow and the other
 * taking it, and the box the shadow can fall in.
 */
export type ConnectorCrossing = {
  key: string;
  x: number;
  y: number;
  box: { x: number; y: number; width: number; height: number };
  lines: readonly [CrossingLine, CrossingLine];
};

type CrossingLine = { key: string; piece: string };

type PieceShape = { d: string; box: Box };

type Box = { minX: number; minY: number; maxX: number; maxY: number };

/** A command of the path, flattened: points `from` to `to` of its line. */
type Piece = Box & { from: number; to: number };

type Polyline = Box & {
  path: ConnectorPath;
  xs: number[];
  ys: number[];
  along: number[];
  pieces: Piece[];
};

const CURVE_STEPS = 16;
const TOUCH = 1e-6;
const PARALLEL = 1e-9;
/** Hits closer than this are one junction: where a line's commands meet, or a curve runs into a trunk. */
const SAME_JUNCTION = 1;

const round = (value: number) => Math.round(value * 1000) / 1000;

function boxOf(xs: readonly number[], ys: readonly number[], from: number, to: number): Box {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let index = from; index <= to; index += 1) {
    minX = Math.min(minX, xs[index]);
    maxX = Math.max(maxX, xs[index]);
    minY = Math.min(minY, ys[index]);
    maxY = Math.max(maxY, ys[index]);
  }
  return { minX, minY, maxX, maxY };
}

const overlaps = (a: Box, b: Box) => a.minX <= b.maxX + TOUCH && b.minX <= a.maxX + TOUCH
  && a.minY <= b.maxY + TOUCH && b.minY <= a.maxY + TOUCH;

/** The absolute M, H, V, L, C and A commands that connectorPaths writes, as points. */
function flatten(path: ConnectorPath): Polyline {
  const tokens = path.d.trim().split(/\s+/);
  const xs: number[] = [];
  const ys: number[] = [];
  const pieces: Piece[] = [];
  let index = 0;
  const next = () => Number(tokens[index++]);
  const to = (x: number, y: number) => {
    if (x === xs.at(-1) && y === ys.at(-1)) return;
    xs.push(x);
    ys.push(y);
  };
  while (index < tokens.length) {
    const command = tokens[index++];
    const x = xs.at(-1) ?? 0;
    const y = ys.at(-1) ?? 0;
    const from = xs.length - 1;
    if (command === 'M') {
      if (xs.length > 0) break;
      xs.push(next());
      ys.push(next());
      continue;
    }
    if (command === 'H') to(next(), y);
    else if (command === 'V') to(x, next());
    else if (command === 'L') { const endX = next(); to(endX, next()); }
    else if (command === 'C') {
      const [x1, y1, x2, y2, endX, endY] = [next(), next(), next(), next(), next(), next()];
      for (let step = 1; step < CURVE_STEPS; step += 1) {
        const t = step / CURVE_STEPS;
        const u = 1 - t;
        to(u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * endX,
          u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * endY);
      }
      to(endX, endY);
    } else if (command === 'A') {
      const [radiusX, radiusY, , large, sweep, endX, endY] = [next(), next(), next(), next(), next(), next(), next()];
      arc(x, y, radiusX, radiusY, large === 1, sweep === 1, endX, endY, to);
    } else break;
    if (xs.length - 1 > from) pieces.push({ ...boxOf(xs, ys, from, xs.length - 1), from, to: xs.length - 1 });
  }
  const along = [0];
  for (let point = 1; point < xs.length; point += 1) {
    along.push(along[point - 1] + Math.hypot(xs[point] - xs[point - 1], ys[point] - ys[point - 1]));
  }
  return { path, xs, ys, along, pieces, ...boxOf(xs, ys, 0, xs.length - 1) };
}

/** An unrotated SVG arc, from its endpoints to its center (SVG 2, appendix B.2.4). */
function arc(
  startX: number, startY: number, radiusX: number, radiusY: number, large: boolean, sweep: boolean,
  endX: number, endY: number, to: (x: number, y: number) => void,
) {
  const halfX = (startX - endX) / 2;
  const halfY = (startY - endY) / 2;
  let rx = Math.abs(radiusX);
  let ry = Math.abs(radiusY);
  const scale = halfX * halfX / (rx * rx) + halfY * halfY / (ry * ry);
  if (!(rx > 0 && ry > 0) || !Number.isFinite(scale)) return to(endX, endY);
  if (scale > 1) {
    rx *= Math.sqrt(scale);
    ry *= Math.sqrt(scale);
  }
  const numerator = rx * rx * ry * ry - rx * rx * halfY * halfY - ry * ry * halfX * halfX;
  const denominator = rx * rx * halfY * halfY + ry * ry * halfX * halfX;
  const coefficient = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, numerator / denominator));
  const centerX = coefficient * rx * halfY / ry + (startX + endX) / 2;
  const centerY = -coefficient * ry * halfX / rx + (startY + endY) / 2;
  const start = Math.atan2((startY - centerY) / ry, (startX - centerX) / rx);
  let turn = Math.atan2((endY - centerY) / ry, (endX - centerX) / rx) - start;
  if (sweep && turn < 0) turn += 2 * Math.PI;
  if (!sweep && turn > 0) turn -= 2 * Math.PI;
  const steps = Math.max(2, Math.ceil(Math.abs(turn) / (Math.PI / 16)));
  for (let step = 1; step < steps; step += 1) {
    const angle = start + turn * step / steps;
    to(centerX + rx * Math.cos(angle), centerY + ry * Math.sin(angle));
  }
  to(endX, endY);
}

type Hit = { x: number; y: number; along: [number, number] };

function hitsBetween(a: Polyline, b: Polyline): Hit[] {
  const hits: Hit[] = [];
  for (const pieceA of a.pieces) {
    for (const pieceB of b.pieces) {
      if (!overlaps(pieceA, pieceB)) continue;
      for (let i = pieceA.from; i < pieceA.to; i += 1) {
        const ax = a.xs[i];
        const ay = a.ys[i];
        const rx = a.xs[i + 1] - ax;
        const ry = a.ys[i + 1] - ay;
        for (let j = pieceB.from; j < pieceB.to; j += 1) {
          const bx = b.xs[j];
          const by = b.ys[j];
          const sx = b.xs[j + 1] - bx;
          const sy = b.ys[j + 1] - by;
          if (Math.max(ax, ax + rx) < Math.min(bx, bx + sx) - TOUCH || Math.max(bx, bx + sx) < Math.min(ax, ax + rx) - TOUCH
            || Math.max(ay, ay + ry) < Math.min(by, by + sy) - TOUCH || Math.max(by, by + sy) < Math.min(ay, ay + ry) - TOUCH) continue;
          const cross = rx * sy - ry * sx;
          // Lines that run along each other, as two trunks at one elbow do, meet where one turns off the other.
          if (Math.abs(cross) <= PARALLEL * Math.hypot(rx, ry) * Math.hypot(sx, sy)) continue;
          const t = ((bx - ax) * sy - (by - ay) * sx) / cross;
          const u = ((bx - ax) * ry - (by - ay) * rx) / cross;
          if (t < -TOUCH || t > 1 + TOUCH || u < -TOUCH || u > 1 + TOUCH) continue;
          hits.push({
            x: ax + rx * t,
            y: ay + ry * t,
            along: [a.along[i] + (a.along[i + 1] - a.along[i]) * t, b.along[j] + (b.along[j + 1] - b.along[j]) * u],
          });
        }
      }
    }
  }
  hits.sort((left, right) => left.along[0] - right.along[0]);
  return hits.filter((hit, index) => index === 0
    || Math.hypot(hit.x - hits[index - 1].x, hit.y - hits[index - 1].y) >= SAME_JUNCTION);
}

/** The stretch of the line within `reach` of the point `at` along it. */
function pieceAround({ xs, ys, along }: Polyline, at: number, reach: number): PieceShape {
  const last = along.length - 1;
  const from = Math.max(0, at - reach);
  const to = Math.min(along[last], at + reach);
  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const points: string[] = [];
  const add = (x: number, y: number) => {
    box.minX = Math.min(box.minX, x);
    box.minY = Math.min(box.minY, y);
    box.maxX = Math.max(box.maxX, x);
    box.maxY = Math.max(box.maxY, y);
    points.push(`${round(x)} ${round(y)}`);
  };
  const point = (segment: number, distance: number) => {
    const span = along[segment + 1] - along[segment];
    const t = span > 0 ? Math.max(0, Math.min(1, (distance - along[segment]) / span)) : 0;
    add(xs[segment] + (xs[segment + 1] - xs[segment]) * t, ys[segment] + (ys[segment + 1] - ys[segment]) * t);
  };
  let segment = 0;
  while (segment < last - 1 && along[segment + 1] <= from) segment += 1;
  point(segment, from);
  while (segment < last - 1 && along[segment + 1] < to) {
    segment += 1;
    add(xs[segment], ys[segment]);
  }
  point(segment, to);
  return { d: `M ${points.join(' L ')}`, box };
}

// A keystroke, or the selection moving through free positions, builds the lines again without moving one, so the
// same lines get the junctions found for them last time. Keyed by every input, shared by the sheets on screen.
const KEPT_RESULTS = 32;
const found = new Map<string, ConnectorCrossing[]>();

/** Every junction between two saved link lines that cross, for a shadow reaching `extent` from the top line. */
export function connectorCrossings(paths: readonly ConnectorPath[], extent: number): ConnectorCrossing[] {
  const saved = paths.filter((path) => !path.ghost && path.d);
  const input = JSON.stringify([extent, saved.map(({ key, sourceId, responseId, d }) => [key, sourceId, responseId, d])]);
  const kept = found.get(input);
  if (kept) {
    found.delete(input);
    found.set(input, kept);
    return kept;
  }
  const crossings = findCrossings(saved, extent);
  found.set(input, crossings);
  if (found.size > KEPT_RESULTS) found.delete(found.keys().next().value!);
  return crossings;
}

// Two lines cross only where their order at the cells they leave is the reverse of their order at their
// responses. Lines in the same order at most touch, as where one joins a trunk it shares with the other, and
// lines out of one cell, or into one response, meet at that end.
const swapOrder = (a: ConnectorPath, b: ConnectorPath) => (a.sourceY - b.sourceY) * (a.responseY - b.responseY) < 0
  && Math.max(Math.min(a.sourceX, a.responseX), Math.min(b.sourceX, b.responseX))
    < Math.min(Math.max(a.sourceX, a.responseX), Math.max(b.sourceX, b.responseX));

function findCrossings(paths: readonly ConnectorPath[], extent: number): ConnectorCrossing[] {
  // Where one line joins or leaves another's lane, they part gradually, so each stretch runs well past the shadow's reach.
  const reach = extent * 4;
  const flattened = new Map<ConnectorPath, Polyline | null>();
  const lineFor = (path: ConnectorPath) => {
    let line = flattened.get(path);
    if (line === undefined) {
      const flat = flatten(path);
      flattened.set(path, line = flat.xs.length > 1 ? flat : null);
    }
    return line;
  };
  const crossings: ConnectorCrossing[] = [];
  for (let first = 0; first < paths.length; first += 1) {
    for (let second = first + 1; second < paths.length; second += 1) {
      if (!swapOrder(paths[first], paths[second])) continue;
      const a = lineFor(paths[first]);
      const b = lineFor(paths[second]);
      if (!a || !b || !overlaps(a, b)) continue;
      hitsBetween(a, b).forEach((hit, index) => {
        const first = pieceAround(a, hit.along[0], reach);
        const second = pieceAround(b, hit.along[1], reach);
        const x = Math.min(first.box.minX, second.box.minX) - extent;
        const y = Math.min(first.box.minY, second.box.minY) - extent;
        crossings.push({
          key: `${a.path.key}|${b.path.key}|${index}`,
          x: round(hit.x),
          y: round(hit.y),
          box: {
            x: round(x), y: round(y),
            width: round(Math.max(first.box.maxX, second.box.maxX) + extent - x),
            height: round(Math.max(first.box.maxY, second.box.maxY) + extent - y),
          },
          lines: [{ key: a.path.key, piece: first.d }, { key: b.path.key, piece: second.d }],
        });
      });
    }
  }
  return crossings;
}
