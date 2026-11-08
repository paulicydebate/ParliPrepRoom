import { describe, expect, it } from 'vitest';
import { computeFlow, insertPosFor, type FlowInputBlock } from '../src/model/flow';
import type { BlockKind } from '../src/model/blocks';
import type { Side, Speech } from '../src/model/speeches';

type Row = [BlockKind, string, { id?: string; speech?: Speech; side?: Side; newRow?: boolean; gap?: number; answers?: string }?];

function blocks(rows: Row[]): FlowInputBlock[] {
  let pos = 0;
  return rows.map(([kind, text, o]) => {
    const b: FlowInputBlock = {
      pos,
      size: text.length + 2,
      id: o?.id ?? `b${pos}`,
      kind,
      text,
      speech: o?.speech ?? null,
      side: o?.side ?? 'gov',
      newRow: o?.newRow ?? false,
      gap: o?.gap ?? 0,
      answers: o?.answers ?? null,
    };
    pos += b.size;
    return b;
  });
}

const cell = (l: ReturnType<typeof computeFlow>, text: string, all: FlowInputBlock[]) => {
  const b = all.find((x) => x.text === text)!;
  const p = l.sheets[0].placements.find((x) => x.pos === b.pos)!;
  return `${p.col}:${p.row}`;
};

describe('linked responses', () => {
  // Three PMC arguments (rows 1-3) and the LOC answers typed in the wrong rows.
  const base: Row[] = [
    ['position', 'Case'],
    ['claim', 'A', { id: 'a' }],
    ['claim', 'B', { id: 'b' }],
    ['claim', 'C', { id: 'c' }],
  ];

  it('moves a response next to the argument it answers, without touching the document order', () => {
    const all = blocks([...base, ['claim', 'ans-to-A', { speech: 'LOC', answers: 'b' }]]);
    const l = computeFlow(all);
    // The answer was typed in C's row but is linked to B, so it sits in B's row.
    expect(cell(l, 'ans-to-A', all)).toBe('2:2');
    expect(l.sheets[0].links).toEqual([{ from: all[2].pos, to: all[4].pos }]);
  });

  it('stacks several responses to one argument and grows the row', () => {
    const all = blocks([
      ...base,
      ['claim', 'r1', { speech: 'LOC', answers: 'a' }],
      ['claim', 'r2', { speech: 'LOC', answers: 'a' }],
      ['claim', 'r3', { speech: 'LOC', answers: 'a' }],
    ]);
    const l = computeFlow(all);
    expect([cell(l, 'r1', all), cell(l, 'r2', all), cell(l, 'r3', all)]).toEqual(['2:1', '2:2', '2:3']);
    // A's row now covers three rows, so B and C move down.
    expect(cell(l, 'B', all)).toBe('1:4');
    expect(cell(l, 'C', all)).toBe('1:5');
    expect(l.sheets[0].links).toHaveLength(3);
  });

  it('warrants right after a linked response stay with it', () => {
    const all = blocks([...base, ['claim', 'r1', { speech: 'LOC', answers: 'a' }], ['warrant', 'w1'], ['claim', 'r2', { speech: 'LOC', answers: 'b' }]]);
    const l = computeFlow(all);
    expect([cell(l, 'r1', all), cell(l, 'w1', all)]).toEqual(['2:1', '2:2']);
    expect(cell(l, 'r2', all)).toBe('2:3'); // B's row starts after A's two rows
    expect(cell(l, 'B', all)).toBe('1:3');
  });

  it('chains: a later speech can answer a linked response', () => {
    const all = blocks([...base, ['claim', 'r1', { id: 'r1', speech: 'LOC', answers: 'b' }], ['claim', 'm1', { speech: 'MG', answers: 'r1' }]]);
    const l = computeFlow(all);
    expect(cell(l, 'r1', all)).toBe('2:2');
    expect(cell(l, 'm1', all)).toBe('3:2');
    expect(l.sheets[0].links).toHaveLength(2);
  });

  it('ignores a link whose target is missing, or not in the column just before', () => {
    const missing = blocks([...base, ['claim', 'x', { speech: 'LOC', answers: 'nope' }]]);
    // As if there were no link: the answer goes in the last row, column LOC.
    expect(cell(computeFlow(missing), 'x', missing)).toBe('2:3');
    expect(computeFlow(missing).sheets[0].links).toEqual([]);
    const skipped = blocks([...base, ['claim', 'x', { speech: 'MG', answers: 'a' }]]); // MG answers a PMC claim: two columns apart
    expect(computeFlow(skipped).sheets[0].links).toEqual([]);
  });

  it('a link to a block on another sheet is ignored', () => {
    const all = blocks([['position', 'S1'], ['claim', 'A', { id: 'a' }], ['position', 'S2'], ['claim', 'B', { id: 'b' }], ['claim', 'x', { speech: 'LOC', answers: 'a' }]]);
    expect(computeFlow(all).sheets[1].links).toEqual([]);
  });

  it('inserting a new cell never lands inside a moved response', () => {
    const all = blocks([...base, ['claim', 'r1', { speech: 'LOC', answers: 'a' }]]);
    const l = computeFlow(all);
    const g = l.sheets[0].groups[0];
    // A's group is only A in document terms; the moved response is not part of where new blocks go.
    expect(insertPosFor(g, 2)).toBe(all[1].pos + all[1].size);
  });

  it('every block still gets exactly one placement', () => {
    const all = blocks([...base, ['claim', 'r1', { speech: 'LOC', answers: 'a' }], ['warrant', 'w'], ['claim', 'r2', { speech: 'LOC', answers: 'zzz' }]]);
    const l = computeFlow(all);
    const posList = l.sheets[0].placements.map((p) => p.pos).sort((x, y) => x - y);
    expect(posList).toEqual(all.slice(1).map((b) => b.pos));
  });
});
