import { describe, expect, it } from 'vitest';
import { diffBlocks, flattenDoc, summarize } from '../src/history/diff';
import { linesToJSON } from '../src/store/seed';
describe('version diff', () => {
    it('flattens a document to styled lines', () => {
        const json = linesToJSON([
            ['position', 'Gov'],
            ['claim', 'C1'],
        ]);
        expect(flattenDoc(json)).toEqual([
            { kind: 'position', text: 'Gov' },
            { kind: 'claim', text: 'C1' },
        ]);
    });
    it('finds added, removed and edited blocks', () => {
        const before = flattenDoc(linesToJSON([['position', 'Gov'], ['claim', 'Old claim'], ['warrant', 'Gone']]));
        const after = flattenDoc(linesToJSON([['position', 'Gov'], ['claim', 'New claim'], ['warrant', 'Extra'], ['note', 'Added']]));
        const rows = diffBlocks(before, after);
        expect(rows[0]).toEqual({ type: 'same', block: { kind: 'position', text: 'Gov' } });
        const changed = rows.filter((r) => r.type === 'changed');
        expect(changed.length).toBeGreaterThan(0);
        const first = changed[0];
        if (first.type !== 'changed')
            throw new Error();
        expect(first.parts.some((p) => p.removed && p.value.includes('Old'))).toBe(true);
        expect(first.parts.some((p) => p.added && p.value.includes('New'))).toBe(true);
        const s = summarize(rows);
        expect(s.added + s.changed + s.removed).toBeGreaterThanOrEqual(3);
    });
    it('reports no changes for identical docs', () => {
        const a = flattenDoc(linesToJSON([['claim', 'Same']]));
        expect(summarize(diffBlocks(a, a))).toEqual({ added: 0, removed: 0, changed: 0 });
    });
});
