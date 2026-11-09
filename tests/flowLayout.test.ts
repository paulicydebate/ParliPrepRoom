import { describe, expect, it } from 'vitest';
import { computeFlow, type FlowInputBlock } from '../src/model/flow';
import { alignedTop, DEFAULT_METRICS as M, layoutFlow } from '../src/model/flowLayout';
import type { BlockKind } from '../src/model/blocks';
import type { Speech } from '../src/model/speeches';

type Row = [BlockKind, string, { id?: string; speech?: Speech; answers?: string; gap?: number }?];
function make(rows: Row[]) {
  let pos = 0;
  const blocks: FlowInputBlock[] = rows.map(([kind, text, o]) => {
    const b: FlowInputBlock = { pos, size: text.length + 2, id: o?.id ?? `b${pos}`, kind, text, speech: o?.speech ?? null, side: 'gov', newRow: false, gap: o?.gap ?? 0, answers: o?.answers ?? null };
    pos += b.size;
    return b;
  });
  const layout = computeFlow(blocks);
  const at = (text: string) => blocks.find((b) => b.text === text)!.pos;
  return { sheet: layout.sheets[0], at };
}
const heights = (at: (t: string) => number, h: Record<string, number>) => new Map(Object.entries(h).map(([t, v]) => [at(t), v]));

describe('free cell layout', () => {
  it('a tall cell does not push its neighbour in the next column', () => {
    const { sheet, at } = make([['position', 'S'], ['claim', 'A'], ['claim', 'a1', { speech: 'LOC' }], ['warrant', 'a1w'], ['claim', 'B']]);
    const g = layoutFlow(sheet, heights(at, { A: 30, a1: 300, a1w: 60, B: 30 }));
    // A is short, a1 is very tall: A's own warrants/neighbours in its column stay put.
    expect(g.tops.get(at('A'))).toBe(0);
    expect(g.tops.get(at('a1'))).toBeGreaterThanOrEqual(0);
    // B starts below the whole first group (its tallest column), not below A.
    expect(g.tops.get(at('B'))!).toBeGreaterThan(g.tops.get(at('a1w'))! + 60 - 1);
  });

  it('lines of one cell touch; separate cells keep a small gap; nothing overlaps', () => {
    const { sheet, at } = make([['position', 'S'], ['claim', 'A'], ['warrant', 'w1'], ['warrant', 'w2'], ['claim', 'A2', { speech: 'LOC' }], ['claim', 'A3', { speech: 'LOC' }]]);
    const g = layoutFlow(sheet, heights(at, { A: 40, w1: 50, w2: 20, A2: 30, A3: 30 }));
    expect(g.tops.get(at('w1'))).toBe(40);
    expect(g.tops.get(at('w2'))).toBe(90); // (a line is at least one row tall)
    expect(g.tops.get(at('A3'))).toBe(g.tops.get(at('A2'))! + 30 + M.cellGap);
    // Each claim and its lines is one box; the two answers are two boxes.
    const loc = g.groups[0].columns.get(2)!;
    expect(loc).toHaveLength(2);
    const pmc = g.groups[0].columns.get(1)!;
    expect(pmc).toHaveLength(1);
    expect(pmc[0].height).toBe(120);
  });

  it('an answer is centered on its argument but stays within the limit of its top', () => {
    expect(alignedTop(100, 200, 40, 76)).toBe(176); // centered would be +80, capped at +76
    expect(alignedTop(100, 40, 200, 76)).toBe(24); // taller than the argument: up to 76 above
    expect(alignedTop(100, 60, 40, 76)).toBe(110);
  });

  it('a linked answer lines up with the argument it answers, not with the first row', () => {
    const { sheet, at } = make([
      ['position', 'S'],
      ['claim', 'A', { id: 'a' }],
      ['warrant', 'aw'],
      ['claim', 'ans', { speech: 'LOC', answers: 'a' }],
    ]);
    const g = layoutFlow(sheet, heights(at, { A: 30, aw: 100, ans: 30 }));
    expect(g.tops.get(at('ans'))).toBe(g.tops.get(at('A')));
  });

  it('answers to different arguments in one column never overlap', () => {
    const { sheet, at } = make([
      ['position', 'S'],
      ['claim', 'A', { id: 'a' }],
      ['claim', 'B', { id: 'b' }],
      ['claim', 'r1', { speech: 'LOC', answers: 'a' }],
      ['claim', 'r2', { speech: 'LOC', answers: 'b' }],
    ]);
    const g = layoutFlow(sheet, heights(at, { A: 30, B: 30, r1: 200, r2: 30 }));
    expect(g.tops.get(at('r2'))!).toBeGreaterThanOrEqual(g.tops.get(at('r1'))! + 200 + M.cellGap);
  });

  it('every block gets a top and groups never overlap', () => {
    const { sheet, at } = make([
      ['position', 'S'],
      ['claim', 'A'], ['claim', 'a1', { speech: 'LOC' }],
      ['section', 'Sec'],
      ['claim', 'B'], ['claim', 'MG ans', { speech: 'MG' }],
    ]);
    const g = layoutFlow(sheet, heights(at, { A: 30, a1: 150, Sec: 28, B: 30, 'MG ans': 20 }));
    for (const p of sheet.placements) expect(g.tops.has(p.pos)).toBe(true);
    expect(g.groups[1].top).toBeGreaterThanOrEqual(g.groups[0].top + g.groups[0].height);
    expect(g.tops.get(at('Sec'))!).toBeGreaterThanOrEqual(g.groups[0].top + g.groups[0].height);
    expect(g.total).toBeGreaterThan(g.ghostTop);
  });

  it('blank rows kept above a group take their own height', () => {
    const { sheet, at } = make([['position', 'S'], ['claim', 'A', { gap: 3 }]]);
    const g = layoutFlow(sheet, heights(at, { A: 30 }));
    expect(g.tops.get(at('A'))).toBe(3 * M.rowHeight);
    expect(g.blanks).toEqual([{ before: 0, top: 0, count: 3 }]);
  });
});

describe('narrow unused columns', () => {
  it('only columns with something in them are wide; the first is always wide', async () => {
    const { columnTracks, NARROW_COLUMN_PX } = await import('../src/model/flowLayout');
    const { sheet } = make([['position', 'S'], ['claim', 'A'], ['claim', 'a1', { speech: 'LOC' }]]);
    const t = columnTracks(sheet, null);
    expect(t.used).toEqual([true, true, false, false, false, false]);
    expect(t.template.split(' ').filter((x) => x === `${NARROW_COLUMN_PX}px`)).toHaveLength(4);
    expect(columnTracks(sheet, 1).template.split(' ').length).toBeGreaterThan(columnTracks(sheet, null).template.split(' ').length - 1);
  });

  it('an empty sheet shows the first column wide and the rest narrow', async () => {
    const { columnTracks } = await import('../src/model/flowLayout');
    const { sheet } = make([['position', 'S']]);
    expect(columnTracks(sheet, null).used).toEqual([true, false, false, false, false, false]);
  });
});

describe('narrow columns with blank cells', () => {
  it('a column holding only blank cells stays narrow, unless the caret is in it', async () => {
    const { columnTracks } = await import('../src/model/flowLayout');
    const { sheet, at } = make([['position', 'S'], ['claim', 'A'], ['claim', '', { speech: 'LOC' }], ['claim', 'mg', { speech: 'MG' }]]);
    const text = new Set([at('A'), at('mg')]);
    const hasText = (pos: number) => text.has(pos);
    expect(columnTracks(sheet, null, { hasText }).used).toEqual([true, false, true, false, false, false]);
    expect(columnTracks(sheet, null, { hasText, caretCol: 2 }).used).toEqual([true, true, true, false, false, false]);
  });
});
