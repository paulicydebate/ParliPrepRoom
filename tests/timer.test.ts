import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_PRESETS, adjust, choose, formatMinutes, loadPresets, parseMinutes, prepMinutes, savePresets, timeLeft } from '../src/store/timer';

describe('timer lengths', () => {
  beforeEach(() => localStorage.clear());

  it('reads lengths the way people type them', () => {
    expect(parseMinutes('25')).toBe(25);
    expect(parseMinutes('2.5')).toBe(2.5);
    expect(parseMinutes('2:30')).toBe(2.5);
    expect(parseMinutes('0:45')).toBe(0.75);
    expect(parseMinutes(' 30 ')).toBe(30);
    for (const bad of ['', '0', 'abc', '-5', '2:75', '181']) expect(parseMinutes(bad)).toBeNull();
  });

  it('writes lengths back the same way', () => {
    expect(formatMinutes(25)).toBe('25');
    expect(formatMinutes(2.5)).toBe('2:30');
  });

  it('keeps each device’s own preset times', () => {
    expect(loadPresets()).toEqual(DEFAULT_PRESETS);
    expect(prepMinutes()).toBe(20);
    savePresets([{ label: 'Prep', minutes: 30 }, { label: 'Flex', minutes: 3 }]);
    expect(prepMinutes()).toBe(30);
    expect(loadPresets()).toHaveLength(2);
    savePresets(null);
    expect(prepMinutes()).toBe(20);
  });

  it('adds and takes away time, paused or running', () => {
    const paused = choose('Prep', 25, false);
    expect(timeLeft(adjust(paused, 60_000))).toBe(26 * 60_000);
    expect(timeLeft(adjust(paused, -30 * 60_000))).toBe(0);
    const running = choose('Prep', 25, true);
    const more = adjust(running, 60_000);
    expect(more.endsAt).not.toBeNull();
    expect(Math.round(timeLeft(more) / 1000)).toBe(26 * 60);
  });
});
