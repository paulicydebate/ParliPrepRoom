import { describe, expect, it } from 'vitest';
import { blockWithChildren, outlineEntries, searchEntries } from '../src/model/outline';
import { linesToJSON } from '../src/store/seed';
const doc = linesToJSON([
    ['position', 'Gov: Ban facial recognition'],
    ['section', 'Advantage 1 — Wrongful arrests'],
    ['claim', 'Misidentification rates differ'],
    ['warrant', 'NIST 2019 found 10–100x false positives'],
    ['claim', 'A2 accuracy improving'],
    ['warrant', 'Improvement is uneven across vendors'],
    ['section', 'Solvency'],
    ['claim', 'Bans work'],
]);
describe('outline entries', () => {
    const entries = outlineEntries(doc);
    it('records the headings above each block', () => {
        expect(entries[3].path).toEqual(['Gov: Ban facial recognition', 'Advantage 1 — Wrongful arrests', 'Misidentification rates differ']);
        expect(entries[7].path).toEqual(['Gov: Ban facial recognition', 'Solvency']);
    });
    it('a claim comes with its warrants; a section with everything under it', () => {
        expect(blockWithChildren(entries, entries[4].id).map((e) => e.text)).toEqual(['A2 accuracy improving', 'Improvement is uneven across vendors']);
        expect(blockWithChildren(entries, entries[1].id)).toHaveLength(5);
    });
    it('search matches warrant text and jumps to the claim above it', () => {
        const [hit] = searchEntries(entries, 'uneven vendors');
        expect(hit.entry.text).toContain('uneven');
        expect(hit.target.text).toBe('A2 accuracy improving');
    });
    it('words can come from the headings above', () => {
        const hits = searchEntries(entries, 'solvency bans');
        expect(hits[0].target.text).toBe('Bans work');
    });
    it('prefers headings that match', () => {
        const hits = searchEntries(entries, 'accuracy');
        expect(hits[0].entry.kind).toBe('claim');
    });
});
