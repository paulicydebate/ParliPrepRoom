import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';
import { layoutFlow, METRICS as M } from '../src/flow2/layout';
import {
  addSheet,
  childrenOf,
  createChild,
  createRoot,
  createSibling,
  deleteCell,
  ensureSheet,
  linkCells,
  readFlow,
  rootsOf,
  sheetOrder,
  unlinkCell,
  yCells,
  yText,
  sheetsMap,
} from '../src/flow2/model';

function setup() {
  const doc = new Y.Doc();
  ensureSheet(doc);
  const sheetId = sheetOrder(doc).get(0);
  const type = (id: string, text: string) => yText(yCells(sheetsMap(doc).get(sheetId)!).get(id)!).insert(0, text);
  const cells = () => readFlow(doc)[0].cells;
  return { doc, sheetId, type, cells };
}

describe('flow2 model', () => {
  it('a flow always has a sheet, named by side', () => {
    const { doc } = setup();
    expect(readFlow(doc)).toHaveLength(1);
    expect(readFlow(doc)[0].name).toBe('Gov 1');
    ensureSheet(doc);
    expect(readFlow(doc)).toHaveLength(1);
    addSheet(doc, 'opp');
    expect(readFlow(doc).map((s) => [s.name, s.columns[0]])).toEqual([['Gov 1', 'PMC'], ['Opp 1', 'LOC']]);
  });

  it('roots run in order; children hang off a parent in the next column', () => {
    const { doc, sheetId, type, cells } = setup();
    const a = createRoot(doc, sheetId, 1)!;
    const b = createRoot(doc, sheetId, 1, a)!;
    const c = createRoot(doc, sheetId, 1, a)!; // between a and b
    expect(rootsOf(cells()).map((r) => r.id)).toEqual([a, c, b]);
    const r1 = createChild(doc, sheetId, a)!;
    const r2 = createChild(doc, sheetId, a, r1)!;
    type(r1, 'one');
    type(r2, 'two');
    expect(childrenOf(cells(), a).map((k) => [k.text, k.col])).toEqual([['one', 2], ['two', 2]]);
    // No column after the last one.
    const last = createChild(doc, sheetId, createChild(doc, sheetId, createChild(doc, sheetId, createChild(doc, sheetId, r2)!)!)!)!;
    expect(createChild(doc, sheetId, last, null, 6)).toBeNull();
  });

  it('a sibling goes right after the cell in the same column and parent', () => {
    const { doc, sheetId, cells } = setup();
    const a = createRoot(doc, sheetId, 1)!;
    const k1 = createChild(doc, sheetId, a)!;
    const k2 = createChild(doc, sheetId, a, k1)!;
    const mid = createSibling(doc, sheetId, k1)!;
    expect(childrenOf(cells(), a).map((k) => k.id)).toEqual([k1, mid, k2]);
  });

  it('linking collapses cells under the argument; empty ones vanish; wrong column is refused', () => {
    const { doc, sheetId, type, cells } = setup();
    const a = createRoot(doc, sheetId, 1)!;
    const b = createRoot(doc, sheetId, 1, a)!;
    type(a, 'A');
    type(b, 'B');
    const x = createChild(doc, sheetId, a)!;
    const y = createChild(doc, sheetId, a, x)!;
    const z = createChild(doc, sheetId, b)!;
    type(x, 'x');
    type(z, 'z'); // y stays empty
    const res = linkCells(doc, sheetId, [x, y, z], b);
    expect(res).toEqual({ linked: [x, z], removed: [y] });
    expect(childrenOf(cells(), b).map((k) => k.id)).toEqual([x, z]);
    expect(cells().some((c) => c.id === y)).toBe(false);
    // Not in the column right after the target:
    const r = linkCells(doc, sheetId, [a], b);
    expect('error' in r).toBe(true);
  });

  it('unlinking turns a cell back into a root right after its old root', () => {
    const { doc, sheetId, type, cells } = setup();
    const a = createRoot(doc, sheetId, 1)!;
    const b = createRoot(doc, sheetId, 1, a)!;
    const x = createChild(doc, sheetId, a)!;
    type(x, 'x');
    unlinkCell(doc, sheetId, x);
    expect(rootsOf(cells()).map((r) => r.id)).toEqual([a, x, b]);
    expect(cells().find((c) => c.id === x)!.parent).toBeNull();
  });

  it('deleting a cell keeps what answered it, as roots in its place', () => {
    const { doc, sheetId, type, cells } = setup();
    const a = createRoot(doc, sheetId, 1)!;
    const b = createRoot(doc, sheetId, 1, a)!;
    const x = createChild(doc, sheetId, a)!;
    type(x, 'keep me');
    deleteCell(doc, sheetId, a);
    expect(cells().find((c) => c.id === a)).toBeUndefined();
    expect(rootsOf(cells()).map((r) => r.id)).toEqual([x, b]);
    expect(cells().find((c) => c.id === x)!.text).toBe('keep me');
  });

  it('two people adding cells at once both survive the merge', () => {
    const a = setup();
    const b = new Y.Doc();
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a.doc));
    const sheetId = a.sheetId;
    createRoot(a.doc, sheetId, 1, null, 0, 'from a');
    createRoot(b, sheetId, 1, null, 0, 'from b');
    Y.applyUpdate(a.doc, Y.encodeStateAsUpdate(b));
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a.doc));
    const texts = (d: Y.Doc) => readFlow(d)[0].cells.map((c) => c.text).sort();
    expect(texts(a.doc)).toEqual(['from a', 'from b']);
    expect(texts(b)).toEqual(texts(a.doc));
  });
});

const cell = (id: string, col: number, parent: string | null, order: number, gap = 0, group: string | null = null) => ({ id, col, parent, order, gap, group, mark: null, refs: [], text: id });

describe('flow2 layout', () => {
  it('stacks roots with a small gap; each cell is as tall as its own text', () => {
    const l = layoutFlow([cell('a', 1, null, 1), cell('b', 1, null, 2)], new Map([['a', 60], ['b', 40]]));
    expect(l.tops.get('a')).toBe(0);
    expect(l.tops.get('b')).toBe(60 + M.rootGap);
  });

  it('a tall answer widens its argument band but not the cells beside it', () => {
    const cells = [cell('a', 1, null, 1), cell('a1', 2, 'a', 1), cell('b', 1, null, 2)];
    const l = layoutFlow(cells, new Map([['a', 30], ['a1', 200], ['b', 30]]));
    expect(l.heights.get('a')).toBe(30);
    expect(l.tops.get('b')!).toBeGreaterThanOrEqual(l.tops.get('a1')! + 200);
  });

  it('answers stack beside their argument without overlapping, centered within the limit', () => {
    const cells = [cell('a', 1, null, 1), cell('r1', 2, 'a', 1), cell('r2', 2, 'a', 2), cell('r3', 2, 'a', 3)];
    const l = layoutFlow(cells, new Map([['a', 200], ['r1', 40], ['r2', 40], ['r3', 40]]));
    expect(l.tops.get('r2')!).toBe(l.tops.get('r1')! + 40 + M.cellGap);
    expect(l.tops.get('r3')!).toBe(l.tops.get('r2')! + 40 + M.cellGap);
    // Block of three (3*40+8=128) centered on a 200 tall argument: offset 36.
    expect(l.tops.get('r1')!).toBe(36);
  });

  it('chains work: an answer to an answer sits beside it', () => {
    const cells = [cell('a', 1, null, 1), cell('r', 2, 'a', 1), cell('m', 3, 'r', 1)];
    const l = layoutFlow(cells, new Map([['a', 30], ['r', 30], ['m', 30]]));
    expect(l.tops.get('m')).toBe(l.tops.get('r'));
  });

  it('blank rows kept above a root take room, and a cell with a missing parent is still shown', () => {
    const l = layoutFlow([cell('a', 1, null, 1, 3), cell('orphan', 2, 'gone', 1)], new Map());
    expect(l.tops.get('a')).toBe(3 * M.rowHeight);
    expect(l.tops.has('orphan')).toBe(true);
    expect(l.blanks).toEqual([{ rootId: 'a', top: 0, count: 3 }]);
  });

  it('every cell gets a top and no two cells of a column overlap', () => {
    const cells = [cell('a', 1, null, 1), cell('b', 1, null, 2), cell('a1', 2, 'a', 1), cell('a2', 2, 'a', 2), cell('b1', 2, 'b', 1), cell('a1x', 3, 'a1', 1)];
    const h = new Map(cells.map((c, i) => [c.id, 25 + i * 17]));
    const l = layoutFlow(cells, h);
    for (const c of cells) expect(l.tops.has(c.id)).toBe(true);
    for (const col of [1, 2, 3]) {
      const mine = cells.filter((c) => c.col === col).sort((x, y) => l.tops.get(x.id)! - l.tops.get(y.id)!);
      for (let i = 1; i < mine.length; i++) expect(l.tops.get(mine[i].id)!).toBeGreaterThanOrEqual(l.tops.get(mine[i - 1].id)! + l.heights.get(mine[i - 1].id)!);
    }
  });
});

import { bindText, diffText, mapPosition } from '../src/flow2/textBinding';

describe('flow2 text binding', () => {
  it('finds the smallest edit between two strings', () => {
    expect(diffText('hello world', 'hello brave world')).toEqual({ at: 6, del: 0, ins: 'brave ' });
    expect(diffText('abc', 'ac')).toEqual({ at: 1, del: 1, ins: '' });
    expect(diffText('abc', 'abc')).toEqual({ at: 3, del: 0, ins: '' });
    expect(diffText('', 'x')).toEqual({ at: 0, del: 0, ins: 'x' });
  });

  it('moves a caret through another person’s edit', () => {
    // "hello|" caret 5; someone inserts "ab" at 0, then deletes 2 chars at 1 (old coordinates)
    expect(mapPosition([{ insert: 'ab' }, { retain: 5 }], 5)).toBe(7);
    expect(mapPosition([{ retain: 6 }, { insert: 'zz' }], 5)).toBe(5);
    expect(mapPosition([{ retain: 1 }, { delete: 2 }], 5)).toBe(3);
  });

  it('typing in a textarea changes the Y.Text, and changes to the Y.Text change the textarea', () => {
    const doc = new Y.Doc();
    const text = doc.getText('t');
    const el = document.createElement('textarea');
    document.body.appendChild(el);
    const off = bindText(el, text);
    el.value = 'hi there';
    el.dispatchEvent(new Event('input'));
    expect(text.toString()).toBe('hi there');
    // a partner types at the start while this caret sits after "hi"
    el.focus();
    el.setSelectionRange(2, 2);
    doc.transact(() => text.insert(0, 'oh '), 'partner');
    expect(el.value).toBe('oh hi there');
    expect(el.selectionStart).toBe(5);
    off();
    el.remove();
  });

  it('two textareas bound to copies of one text converge', () => {
    const d1 = new Y.Doc();
    const d2 = new Y.Doc();
    const t1 = d1.getText('t');
    const t2 = d2.getText('t');
    d1.on('update', (u) => Y.applyUpdate(d2, u));
    d2.on('update', (u) => Y.applyUpdate(d1, u));
    const e1 = document.createElement('textarea');
    const e2 = document.createElement('textarea');
    bindText(e1, t1);
    bindText(e2, t2);
    e1.value = 'abc';
    e1.dispatchEvent(new Event('input'));
    e2.value = 'abcd';
    e2.dispatchEvent(new Event('input'));
    e1.value = 'Xabcd';
    e1.dispatchEvent(new Event('input'));
    expect(t1.toString()).toBe('Xabcd');
    expect(e2.value).toBe('Xabcd');
  });
});

import { connectorPath, routeBetween } from '../src/flow2/connectors';
import { connectorCrossings, CROSSING_SHADOW_DEFAULTS, crossingShadowExtent } from '../src/flow2/connectorCrossings';

describe('flow2 connectors (from Flowist)', () => {
  const rect = (left: number, top: number, w = 150, h = 30) => ({ left, right: left + w, top, bottom: top + h });

  it('runs from the argument’s right edge to the answer’s left edge, bending halfway across the gutter', () => {
    const r = routeBetween('a:b', rect(0, 0), rect(194, 60), 'a', 'b');
    expect(r.sourceX).toBe(150);
    expect(r.responseX).toBe(194);
    expect(r.elbowX).toBeCloseTo(172, 5);
    const p = connectorPath(r);
    expect(p.d.startsWith('M 150 15')).toBe(true);
    expect(p.d).toContain(' C ');
    expect(p.straight).toBe(false);
  });

  it('a line between cells at the same height is straight', () => {
    const p = connectorPath(routeBetween('a:b', rect(0, 0), rect(194, 0), 'a', 'b'));
    expect(p.straight).toBe(true);
    expect(p.d).toBe('M 150 15 L 194 15');
  });

  it('finds where two lines cross', () => {
    const a = connectorPath(routeBetween('a:c', rect(0, 0), rect(194, 100), 'a', 'c'));
    const b = connectorPath(routeBetween('b:d', rect(0, 100), rect(194, 0), 'b', 'd'));
    expect(connectorCrossings([a, b], crossingShadowExtent(CROSSING_SHADOW_DEFAULTS)).length).toBeGreaterThan(0);
    const parallel = connectorPath(routeBetween('e:f', rect(0, 200), rect(194, 300), 'e', 'f'));
    expect(connectorCrossings([a, parallel], crossingShadowExtent(CROSSING_SHADOW_DEFAULTS))).toEqual([]);
  });
});

import { columnGeometry } from '../src/flow2/columns';
import { isWorldRectNearViewport, nextSheetPosition, stepZoom, viewportToWorld, zoomAt } from '../src/flow2/canvasGeometry';
import { readWheelIntent } from '../src/flow2/canvasWheel';
import { moveSheet } from '../src/flow2/model';

describe('flow2 canvas (camera maths from Flowist)', () => {
  it('zooming about a point keeps the point under the pointer', () => {
    const cam = { x: 100, y: 50, zoom: 1 };
    const anchor = { x: 400, y: 300 };
    const before = viewportToWorld(anchor, cam);
    const next = zoomAt(cam, anchor, 2);
    expect(next.zoom).toBe(2);
    const after = viewportToWorld(anchor, next);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
    expect(zoomAt(cam, anchor, 50).zoom).toBe(2); // capped
    expect(zoomAt(cam, anchor, 0.01).zoom).toBe(0.25);
  });

  it('wheel: scrolling pans, ctrl or ⌘ zooms, shift scrolls sideways', () => {
    const base = { deltaX: 0, deltaY: 30, deltaMode: 0, ctrlKey: false, metaKey: false, shiftKey: false, clientX: 10, clientY: 20 };
    expect(readWheelIntent(base, 800)).toMatchObject({ kind: 'pan', dy: -30 });
    const z = readWheelIntent({ ...base, ctrlKey: true }, 800);
    expect(z.kind).toBe('zoom');
    expect(readWheelIntent({ ...base, shiftKey: true }, 800)).toMatchObject({ kind: 'pan', dy: 0 });
  });

  it('steps zoom through fixed levels and places a new sheet beside the others', () => {
    expect(stepZoom(1, 'in')).toBeGreaterThan(1);
    expect(stepZoom(1, 'out')).toBeLessThan(1);
    expect(stepZoom(2, 'in')).toBe(2);
    expect(nextSheetPosition([])).toEqual({ x: 0, y: 0 });
    expect(nextSheetPosition([{ x: 0, y: 10, width: 100, height: 50 }])).toEqual({ x: 148, y: 10 });
  });

  it('only sheets near the view are drawn live', () => {
    const cam = { x: 0, y: 0, zoom: 1 };
    const view = { width: 1000, height: 700 };
    expect(isWorldRectNearViewport({ x: 100, y: 100, width: 300, height: 200 }, cam, view)).toBe(true);
    expect(isWorldRectNearViewport({ x: 5000, y: 100, width: 300, height: 200 }, cam, view, 400)).toBe(false);
  });

  it('a sheet remembers where it was put, and columns narrow until used', () => {
    const { doc, sheetId, cells } = setup();
    void cells;
    moveSheet(doc, sheetId, 120.4, -30);
    expect(readFlow(doc)[0]).toMatchObject({ x: 120, y: -30 });
    const g = columnGeometry(readFlow(doc)[0], null, null);
    expect(g.used).toEqual([true, false, false, false, false, false]);
    expect(g.colW[1]).toBe(76);
    const g2 = columnGeometry(readFlow(doc)[0], 3, null);
    expect(g2.used[2]).toBe(true);
    expect(g2.minWidth).toBeGreaterThan(g.minWidth);
  });
});


import { directionalTarget, cycleTarget } from '../src/flow2/directionalTarget';
import { groupCells, ungroupCells } from '../src/flow2/model';

describe('flow2 groups', () => {
  it('grouping puts cells of one column and parent next to each other; mixed columns are refused', () => {
    const { doc, sheetId, cells } = setup();
    const a = createRoot(doc, sheetId, 1)!;
    const k1 = createChild(doc, sheetId, a)!;
    const k2 = createChild(doc, sheetId, a, k1)!;
    const k3 = createChild(doc, sheetId, a, k2)!;
    const r = groupCells(doc, sheetId, [k1, k3]);
    expect(r.ok).toBe(true);
    // k3 now sits right after k1, ahead of k2.
    expect(childrenOf(cells(), a).map((k) => k.id)).toEqual([k1, k3, k2]);
    expect(cells().find((c) => c.id === k1)!.group).toBe(cells().find((c) => c.id === k3)!.group);
    expect(groupCells(doc, sheetId, [a, k1]).ok).toBe(false);
    ungroupCells(doc, sheetId, [k1, k3]);
    expect(cells().every((c) => c.group === null)).toBe(true);
  });

  it('cells of a group touch in the layout, and the group has a frame', () => {
    const cells = [cell('a', 1, null, 1), cell('x', 2, 'a', 1, 0, 'g'), cell('y', 2, 'a', 2, 0, 'g'), cell('z', 2, 'a', 3)];
    const l = layoutFlow(cells, new Map([['a', 30], ['x', 30], ['y', 30], ['z', 30]]));
    expect(l.tops.get('y')).toBe(l.tops.get('x')! + 30);
    expect(l.tops.get('z')).toBe(l.tops.get('y')! + 30 + M.cellGap);
    expect(l.groups).toEqual([{ id: 'g', col: 2, top: l.tops.get('x'), height: 60 }]);
  });
});

describe('flow2 arrow navigation (from Flowist)', () => {
  const box = (left: number, top: number) => ({ left, right: left + 100, top, bottom: top + 30 });
  const items = [{ id: 'up', ...box(0, 0) }, { id: 'down', ...box(0, 80) }, { id: 'right', ...box(150, 5) }, { id: 'farRight', ...box(150, 200) }];
  const of = (i: { left: number; right: number; top: number; bottom: number }) => i;
  it('goes to the nearest cell in the direction, preferring the one in line', () => {
    const here = box(0, 40);
    expect(directionalTarget('ArrowUp', here, items, of)?.id).toBe('up');
    expect(directionalTarget('ArrowDown', here, items, of)?.id).toBe('down');
    expect(directionalTarget('ArrowRight', here, items, of)?.id).toBe('right');
    expect(directionalTarget('ArrowLeft', here, items, of)).toBeUndefined();
  });
  it('cycles through a list', () => {
    expect(cycleTarget(['a', 'b', 'c'], 2, false)).toBe('a');
    expect(cycleTarget(['a', 'b', 'c'], 0, true)).toBe('c');
  });
});

import { addRef, removeRef, refKey } from '../src/flow2/model';
import { createTrackpadClock, createTrackpadPath } from '../src/flow2/trackpadPath';

describe('flow2 cross-applications and extensions', () => {
  it('a cell can point at a cell on another sheet (x) or an earlier one on its own sheet (e), once each', () => {
    const { doc, sheetId, cells } = setup();
    const other = addSheet(doc, 'opp');
    const mine = createRoot(doc, sheetId, 1, null, 0, 'Econ Bad')!;
    const theirs = createRoot(doc, other, 2, null, 0, 'Their K')!;
    expect(addRef(doc, other, theirs, { kind: 'x', sheet: sheetId, cell: mine })).toBe(true);
    expect(addRef(doc, other, theirs, { kind: 'x', sheet: sheetId, cell: mine })).toBe(true); // again: no duplicate
    const t = readFlow(doc)[1].cells.find((c) => c.id === theirs)!;
    expect(t.refs).toEqual([{ kind: 'x', sheet: sheetId, cell: mine }]);
    // a cell cannot point at itself
    expect(addRef(doc, sheetId, mine, { kind: 'e', sheet: sheetId, cell: mine })).toBe(false);
    const ext = createChild(doc, sheetId, mine)!;
    expect(addRef(doc, sheetId, ext, { kind: 'e', sheet: sheetId, cell: mine })).toBe(true);
    expect(cells().find((c) => c.id === ext)!.refs.map(refKey)).toEqual([`e:${sheetId}:${mine}`]);
    removeRef(doc, sheetId, ext, { kind: 'e', sheet: sheetId, cell: mine });
    expect(cells().find((c) => c.id === ext)!.refs).toEqual([]);
  });

  it('refs merge between two people', () => {
    const a = setup();
    const cell1 = createRoot(a.doc, a.sheetId, 1, null, 0, 'one')!;
    const cell2 = createRoot(a.doc, a.sheetId, 1, cell1, 0, 'two')!;
    const b = new Y.Doc();
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a.doc));
    addRef(a.doc, a.sheetId, cell2, { kind: 'e', sheet: a.sheetId, cell: cell1 });
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a.doc));
    expect(readFlow(b)[0].cells.find((c) => c.id === cell2)!.refs).toHaveLength(1);
  });
});

describe('flow2 trackpad path (from Flowist)', () => {
  it('draws a pan between the events it has, never past the newest, and settles on it', () => {
    const clock = createTrackpadClock();
    const t0 = 1000;
    const t = clock.stamped(t0, t0 + 2);
    const path = createTrackpadPath(clock, { x: 0, y: 0 }, { x: 0, y: -20 }, t);
    const t1 = clock.stamped(t0 + 16.7, t0 + 18);
    path.add({ x: 0, y: -40 }, t1);
    let last = { x: 0, y: 0 };
    for (let now = t0 + 20; now < t0 + 200; now += 16.7) {
      const p = path.draw(now);
      expect(p.y).toBeLessThanOrEqual(last.y + 1e-6); // moving up the page, never back
      expect(p.y).toBeGreaterThanOrEqual(-40 - 1e-6); // never past the newest event
      last = p;
    }
    expect(last.y).toBeCloseTo(-40, 5);
  });
});

import { resetSheetPosition, setMark } from '../src/flow2/model';

describe('flow2 marks and snap', () => {
  it('marks cells, toggles off, and carries the mark in readFlow', () => {
    const { doc, sheetId, cells } = setup();
    const a = createRoot(doc, sheetId, 1)!;
    const b = createRoot(doc, sheetId, 1)!;
    setMark(doc, sheetId, [a, b], 'dropped');
    expect(cells().map((c) => c.mark)).toEqual(['dropped', 'dropped']);
    setMark(doc, sheetId, [a], 'key');
    expect(cells().find((c) => c.id === a)!.mark).toBe('key');
    setMark(doc, sheetId, [a, b], null);
    expect(cells().every((c) => c.mark === null)).toBe(true);
  });

  it('snap back clears a moved sheet position', () => {
    const { doc, sheetId } = setup();
    moveSheet(doc, sheetId, 500, 300);
    expect(readFlow(doc)[0].x).toBe(500);
    resetSheetPosition(doc, sheetId);
    expect(readFlow(doc)[0].x).toBeNull();
    expect(readFlow(doc)[0].y).toBeNull();
  });
});

describe('flow2 minimized columns', () => {
  it('gives a minimized column a thin strip, except where the caret is', () => {
    const { doc, sheetId, type } = setup();
    const a = createRoot(doc, sheetId, 1)!;
    type(a, 'x');
    const sheet = readFlow(doc)[0];
    const base = columnGeometry(sheet, null, null);
    const min = columnGeometry(sheet, null, null, [1]);
    expect(min.colW[0]).toBe(28);
    expect(min.minWidth).toBeLessThan(base.minWidth);
    expect(columnGeometry(sheet, 1, null, [1]).colW[0]).toBeGreaterThan(28);
  });
});

import { flowEntries, searchFlow } from '../src/model/flowSearch';

describe('flow search', () => {
  it('finds cells by every word, allows a misspelling, and ranks the cell itself first', () => {
    const { doc, sheetId, type } = setup();
    const a = createRoot(doc, sheetId, 1)!;
    type(a, 'Rubber bullets cause injuries');
    const b = createChild(doc, sheetId, a)!;
    type(b, 'No evidence of injury');
    const entries = flowEntries(readFlow(doc));
    expect(entries.length).toBe(2);
    expect(searchFlow(entries, 'rubber injuries')[0].entry.cellId).toBe(a);
    expect(searchFlow(entries, 'rubbr')[0].entry.cellId).toBe(a);
    const second = searchFlow(entries, 'rubber evidence');
    expect(second.map((h) => h.entry.cellId)).toEqual([b]);
    expect(searchFlow(entries, 'zebra')).toEqual([]);
  });
});

import { buildFlow2Xlsx, flowRows } from '../src/export/flowXlsx';
import { importSheetsToFlow } from '../src/import/flowImport';
import { parseXlsx } from '../src/import/importFile';

describe('flow Excel export and import', () => {
  it('writes a flow to Excel and reads it back as the same arguments and answers', () => {
    const { doc, sheetId, type } = setup();
    const a = createRoot(doc, sheetId, 1)!;
    type(a, 'Rubber bullets cause injuries');
    const a1 = createChild(doc, sheetId, a)!;
    type(a1, 'No evidence');
    const a2 = createSibling(doc, sheetId, a1)!;
    type(a2, 'Studies show it is safe');
    const a1x = createChild(doc, sheetId, a1)!;
    type(a1x, 'Turn: it is not safe');
    setMark(doc, sheetId, [a], 'dropped');
    const b = createRoot(doc, sheetId, 1, a)!;
    type(b, 'Second point');

    const rows = flowRows(readFlow(doc)[0].cells);
    expect(rows.rows).toBe(3);
    expect(rows.at.get(a)).toBe(0);
    expect(rows.at.get(a2)).toBe(1);
    expect(rows.at.get(b)).toBe(2);

    const bytes = buildFlow2Xlsx(readFlow(doc));
    const grid = parseXlsx(bytes);
    expect(grid[0].rows[0].slice(0, 3)).toEqual(['PMC', 'LOC', 'MG']);
    expect(grid[0].rows[1][0]).toContain('Rubber bullets');

    const fresh = new Y.Doc();
    expect(importSheetsToFlow(fresh, grid)).toBe(5);
    const back = readFlow(fresh)[0];
    const text = (id: string) => back.cells.find((c) => c.id === id)!.text;
    const byText = (t: string) => back.cells.find((c) => c.text === t)!;
    expect(byText('Rubber bullets cause injuries').mark).toBe('dropped');
    expect(byText('No evidence').parent).toBe(byText('Rubber bullets cause injuries').id);
    expect(byText('Studies show it is safe').parent).toBe(byText('Rubber bullets cause injuries').id);
    expect(byText('Turn: it is not safe').parent).toBe(byText('No evidence').id);
    expect(byText('Second point').parent).toBeNull();
    expect(text(byText('Second point').id)).toBe('Second point');
  });
});

import { renameSheet } from '../src/flow2/model';

describe('flow2 hardening (review 2026-11-13)', () => {
  it('never splits an emoji when diffing text', () => {
    // 😀 and 😁 share their first half; a naive diff would insert half a character.
    for (const [a, b] of [['😀', '😁😀'], ['😀', '😁'], ['a😀b', 'a😁b'], ['😀😀', '😀']] as const) {
      const d = diffText(a, b);
      const text = new Y.Doc().getText('t');
      text.insert(0, a);
      if (d.del) text.delete(d.at, d.del);
      if (d.ins) text.insert(d.at, d.ins);
      expect(text.toString()).toBe(b);
      expect(text.toString()).not.toContain('�');
    }
  });

  it('shows an answer whose argument another person deleted, and a cell in a column the sheet lacks', () => {
    const { doc, sheetId, type, cells } = setup();
    const a = createRoot(doc, sheetId, 1)!;
    type(a, 'arg');
    const b = createChild(doc, sheetId, a)!;
    type(b, 'answer');
    const ymap = yCells(sheetsMap(doc).get(sheetId)!);
    ymap.delete(a); // as a concurrent delete would leave it
    ymap.get(b)!.set('col', 99);
    const read = cells();
    expect(read).toHaveLength(1);
    expect(read[0].parent).toBeNull();
    expect(read[0].col).toBe(readFlow(doc)[0].columns.length);
    expect(rootsOf(read).map((c) => c.id)).toEqual([b]);
    expect(() => buildFlow2Xlsx(readFlow(doc))).not.toThrow();
    expect(flowRows(read).at.has(b)).toBe(true);
  });

  it('orders cells with the same place the same way for everyone, and lists a sheet once', () => {
    const { doc, sheetId, cells } = setup();
    const a = createRoot(doc, sheetId, 1)!;
    const b = createRoot(doc, sheetId, 1, a)!;
    const ymap = yCells(sheetsMap(doc).get(sheetId)!);
    ymap.get(a)!.set('order', 5);
    ymap.get(b)!.set('order', 5);
    expect(rootsOf(cells()).map((c) => c.id)).toEqual([a, b].sort());
    sheetOrder(doc).push([sheetId]);
    expect(readFlow(doc)).toHaveLength(1);
  });

  it('caps a sheet name', () => {
    const { doc, sheetId } = setup();
    renameSheet(doc, sheetId, 'x'.repeat(500));
    expect(readFlow(doc)[0].name).toHaveLength(80);
  });
});

describe('typing with an input method while a partner edits', () => {
  it('keeps both the composed text and the partner’s change', () => {
    const doc = new Y.Doc();
    const text = doc.getText('t');
    text.insert(0, 'abc');
    const el = document.createElement('textarea');
    document.body.appendChild(el);
    const off = bindText(el, text);
    el.focus();
    el.dispatchEvent(new CompositionEvent('compositionstart'));
    el.value = 'abcにほ';
    el.dispatchEvent(new Event('input'));
    doc.transact(() => text.insert(0, 'X'), 'partner'); // partner types at the start meanwhile
    expect(el.value).toBe('abcにほ'); // the box is left alone while composing
    el.value = 'abc日本';
    el.dispatchEvent(new CompositionEvent('compositionend'));
    expect(text.toString()).toBe('Xabc日本');
    expect(el.value).toBe('Xabc日本');
    off();
    el.remove();
  });
});

describe('row order and groups (review 2026-11-13)', () => {
  it('fits any number of cells between two neighbours, in order', () => {
    const { doc, sheetId, cells } = setup();
    const a = createRoot(doc, sheetId, 1)!;
    const z = createRoot(doc, sheetId, 1, a)!;
    let after = a;
    const made: string[] = [];
    for (let i = 0; i < 80; i++) {
      after = createRoot(doc, sheetId, 1, after)!;
      made.push(after);
    }
    const order = rootsOf(cells()).map((c) => c.id);
    expect(order).toEqual([a, ...made, z]);
    expect(new Set(cells().map((c) => c.order)).size).toBe(cells().length);
  });

  it('a new row goes right after its neighbour even when another column has a root in between in order', () => {
    const { doc, sheetId, cells } = setup();
    const a = createRoot(doc, sheetId, 1)!;
    const x = createRoot(doc, sheetId, 2, a)!; // a root in the second column, right after a
    const s = createSibling(doc, sheetId, a)!;
    expect(rootsOf(cells()).map((c) => c.id)).toEqual([a, s, x]);
  });

  it('deleting a root keeps its blank rows', () => {
    const { doc, sheetId, cells } = setup();
    const a = createRoot(doc, sheetId, 1)!;
    const b = createRoot(doc, sheetId, 1, a, 3)!;
    const c = createRoot(doc, sheetId, 1, b)!;
    deleteCell(doc, sheetId, b);
    expect(cells().find((k) => k.id === c)!.gap).toBe(3);
  });

  it('a group frame splits when a cell ends up between its members', () => {
    const { doc, sheetId, type } = setup();
    const a = createRoot(doc, sheetId, 1)!;
    const b = createRoot(doc, sheetId, 1, a)!;
    type(a, 'a');
    type(b, 'b');
    expect(groupCells(doc, sheetId, [a, b])).toMatchObject({ ok: true });
    const heights = new Map([[a, 30], [b, 30]]);
    expect(layoutFlow(readFlow(doc)[0].cells, heights, M).groups).toHaveLength(1);
    createRoot(doc, sheetId, 1, a); // a new row lands between the two
    expect(layoutFlow(readFlow(doc)[0].cells, heights, M).groups).toHaveLength(0);
  });
});
