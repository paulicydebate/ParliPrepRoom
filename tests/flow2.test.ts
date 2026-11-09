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

const cell = (id: string, col: number, parent: string | null, order: number, gap = 0) => ({ id, col, parent, order, gap, text: id });

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
