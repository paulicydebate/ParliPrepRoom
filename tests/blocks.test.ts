import { describe, expect, it } from 'vitest';
import { cycleKind, demote, promote, newBlockId } from '../src/model/blocks';

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

  it('Shift+Enter cycles through every style in order and wraps around', () => {
    const order = ['position', 'section', 'claim', 'warrant', 'analytic', 'note'] as const;
    for (let i = 0; i < order.length; i++) {
      expect(cycleKind(order[i])).toBe(order[(i + 1) % order.length]);
      expect(cycleKind(order[i], -1)).toBe(order[(i + order.length - 1) % order.length]);
    }
  });

  it('makes distinct ids', () => {
    const ids = new Set(Array.from({ length: 500 }, newBlockId));
    expect(ids.size).toBe(500);
  });
});
