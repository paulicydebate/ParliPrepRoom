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

  it('stacks blocks of one column with a gap and does not overlap them', () => {
    const { sheet, at } = make([['position', 'S'], ['claim', 'A'], ['warrant', 'w1'], ['warrant', 'w2']]);
    const g = layoutFlow(sheet, heights(at, { A: 40, w1: 50, w2: 20 }));
    expect(g.tops.get(at('w1'))).toBe(40 + M.cellGap);
    expect(g.tops.get(at('w2'))).toBe(40 + M.cellGap + 50 + M.cellGap);
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
