import { describe, expect, it } from 'vitest';
import { KIND_INFO, demote, promote, newBlockId } from '../src/model/blocks';
describe('block styles', () => {
    it('Tab moves down the outline and stops at body text', () => {
        expect(demote('position')).toBe('section');
        expect(demote('section')).toBe('claim');
        expect(demote('claim')).toBe('warrant');
        expect(demote('warrant')).toBe('warrant');
        expect(demote('note')).toBe('note');
    });
    it('Shift-Tab moves up and stops at position title', () => {
        expect(promote('warrant')).toBe('claim');
        expect(promote('analytic')).toBe('claim');
        expect(promote('claim')).toBe('section');
        expect(promote('position')).toBe('position');
    });
    it('Enter follows the outline order', () => {
        expect(KIND_INFO.position.next).toBe('section');
        expect(KIND_INFO.section.next).toBe('claim');
        expect(KIND_INFO.claim.next).toBe('warrant');
        expect(KIND_INFO.warrant.next).toBe('warrant');
    });
    it('makes distinct ids', () => {
        const ids = new Set(Array.from({ length: 500 }, newBlockId));
        expect(ids.size).toBe(500);
    });
});
