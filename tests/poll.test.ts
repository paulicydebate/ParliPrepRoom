import { describe, expect, it } from 'vitest';
import { ACTIVE_WINDOW_MS, FAST_MS, SLOW_MS, nextDelay, wasIdle } from '../src/store/poll';

describe('refresh timing', () => {
  it('is quick while someone is using the app and slow while a tab sits idle', () => {
    expect(nextDelay(5_000, 0.5)).toBe(FAST_MS);
    expect(nextDelay(ACTIVE_WINDOW_MS + 1, 0.5)).toBe(SLOW_MS);
  });

  it('spreads tabs out by about 15% either way', () => {
    expect(nextDelay(0, 0)).toBe(Math.round(FAST_MS * 0.85));
    expect(nextDelay(0, 1)).toBe(Math.round(FAST_MS * 1.15));
    expect(nextDelay(ACTIVE_WINDOW_MS * 2, 0)).toBe(Math.round(SLOW_MS * 0.85));
  });

  it('about 4 times fewer asks per hour for an idle tab', () => {
    const perHour = (ms: number) => 3_600_000 / nextDelay(ms, 0.5);
    expect(perHour(0)).toBe(120);
    expect(perHour(ACTIVE_WINDOW_MS * 5)).toBe(30);
  });

  it('knows when someone has come back after being idle', () => {
    expect(wasIdle(ACTIVE_WINDOW_MS - 1)).toBe(false);
    expect(wasIdle(ACTIVE_WINDOW_MS)).toBe(true);
  });
});
