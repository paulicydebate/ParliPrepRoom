import { describe, expect, it } from 'vitest';
import { computeFlow, insertPosFor } from '../src/model/flow';
function blocks(rows) {
    let pos = 0;
    return rows.map(([kind, text, o]) => {
        const b = { pos, size: text.length + 2, id: `${pos}`, kind, text, speech: o?.speech ?? null, side: o?.side ?? 'gov', newRow: o?.newRow ?? false, gap: o?.gap ?? 0 };
        pos += b.size;
        return b;
    });
}
const where = (layout, sheet = 0) => layout.sheets[sheet].placements.map((p) => `${p.col}:${p.row}`);
describe('flow layout', () => {
    it('puts each sheet-speech claim on its own row and answers beside it', () => {
        const l = computeFlow(blocks([
            ['note', 'intro'],
            ['position', 'Case', { side: 'gov' }],
            ['claim', 'C1'],
            ['warrant', 'W1'],
            ['claim', 'A2 C1', { speech: 'LOC' }],
            ['warrant', 'their warrant'],
            ['claim', 'MG answer', { speech: 'MG' }],
            ['claim', 'C2'],
        ]));
        expect(l.preamble).toHaveLength(1);
        expect(l.sheets).toHaveLength(1);
        expect(l.sheets[0].columns).toEqual(['PMC', 'LOC', 'MG', 'MO', 'LOR', 'PMR']);
        // C1, W1 in PMC rows 1-2; LOC answer + warrant rows 1-2; MG row 1; C2 row 3.
        expect(where(l)).toEqual(['1:1', '1:2', '2:1', '2:2', '3:1', '1:3']);
        expect(l.sheets[0].groups.map((g) => [g.row, g.span])).toEqual([
            [1, 2],
            [3, 1],
        ]);
    });
    it('opp sheets start at the LOC and section titles span the row', () => {
        const l = computeFlow(blocks([
            ['position', 'DA', { side: 'opp' }],
            ['section', 'Links'],
            ['claim', 'L1'],
            ['claim', 'No link', { speech: 'MG' }],
            ['section', 'Impacts'],
            ['claim', 'I1'],
        ]));
        expect(l.sheets[0].columns[0]).toBe('LOC');
        expect(where(l)).toEqual(['0:1', '1:2', '2:2', '0:3', '1:4']);
    });
    it('new-row claims start a row in a later column', () => {
        const l = computeFlow(blocks([
            ['position', 'Case'],
            ['claim', 'C1'],
            ['claim', 'MG new arg', { speech: 'MG', newRow: true }],
            ['claim', 'MO answer', { speech: 'MO' }],
        ]));
        expect(where(l)).toEqual(['1:1', '3:2', '4:2']);
    });
    it('inserts answers after earlier columns so the doc stays in speaking order', () => {
        const l = computeFlow(blocks([
            ['position', 'Case'],
            ['claim', 'C1'],
            ['warrant', 'W1'],
            ['claim', 'MG', { speech: 'MG' }],
            ['claim', 'C2'],
        ]));
        const g = l.sheets[0].groups[0];
        const w1 = l.sheets[0].placements[1];
        // A LOC answer goes after W1 (PMC column) and before the MG claim.
        expect(insertPosFor(g, 2)).toBe(w1.pos + 4);
    });
    it('records effective speech for doc-view tags', () => {
        const l = computeFlow(blocks([
            ['position', 'Case'],
            ['claim', 'C1'],
            ['claim', 'A', { speech: 'LOC' }],
            ['warrant', 'w'],
        ]));
        expect([...l.speechAt.values()]).toEqual(['PMC', 'LOC', 'LOC']);
    });
});
describe('row spans', () => {
    it('stretches the last block of each cell to the bottom of its row group', () => {
        const l = computeFlow(blocks([
            ['position', 'Case'],
            ['claim', 'C1'],
            ['warrant', 'W1'],
            ['warrant', 'W2'],
            ['claim', 'A', { speech: 'LOC' }],
        ]));
        expect(l.sheets[0].placements.map((p) => p.rowSpan)).toEqual([1, 1, 1, 3]);
    });
});
describe('blank rows', () => {
    it('a gap keeps blank rows above a row and counts toward the sheet', () => {
        const l = computeFlow(blocks([
            ['position', 'Case'],
            ['claim', 'C1'],
            ['claim', 'C2', { gap: 5 }],
        ]));
        expect(where(l)).toEqual(['1:1', '1:7']);
        expect(l.sheets[0].blanks).toEqual([{ row: 2, count: 5, before: 1 }]);
        expect(l.sheets[0].ghostRows).toBe(150 - 7);
    });
});
