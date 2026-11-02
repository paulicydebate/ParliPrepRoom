import { describe, expect, it } from 'vitest';
import { styleForKey } from '../src/editor/shortcuts';

const key = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init);

describe('style key presets', () => {
  it('Ctrl preset uses Ctrl+digit only', () => {
    expect(styleForKey(key({ key: '1', code: 'Digit1', ctrlKey: true }), 'ctrl')).toBe('position');
    expect(styleForKey(key({ key: '3', code: 'Digit3', ctrlKey: true }), 'ctrl')).toBe('claim');
    expect(styleForKey(key({ key: '1', code: 'Digit1', ctrlKey: true, altKey: true }), 'ctrl')).toBeNull();
    expect(styleForKey(key({ key: '1', code: 'Digit1' }), 'ctrl')).toBeNull();
  });

  it('Alt preset reads the physical key, so Option+1 (which types ¡) still works', () => {
    expect(styleForKey(key({ key: '¡', code: 'Digit1', altKey: true }), 'alt')).toBe('position');
    expect(styleForKey(key({ key: '6', code: 'Numpad6', altKey: true }), 'alt')).toBe('note');
  });

  it('F-key preset maps F4–F9', () => {
    expect(styleForKey(key({ key: 'F4', code: 'F4' }), 'fkeys')).toBe('position');
    expect(styleForKey(key({ key: 'F7', code: 'F7' }), 'fkeys')).toBe('warrant');
    expect(styleForKey(key({ key: 'F10', code: 'F10' }), 'fkeys')).toBeNull();
    expect(styleForKey(key({ key: 'F4', code: 'F4', ctrlKey: true }), 'fkeys')).toBeNull();
  });

  it('ignores 7–9 and shifted digits', () => {
    expect(styleForKey(key({ key: '7', code: 'Digit7', altKey: true }), 'alt')).toBeNull();
    expect(styleForKey(key({ key: '!', code: 'Digit1', altKey: true, shiftKey: true }), 'alt')).toBeNull();
  });
});
