import { useSyncExternalStore } from 'react';
import { createSignal } from './emitter';
import { logEvent } from './typingLog';

// Round Mode: during the round, only round docs (typed by hand during prep)
// can be opened, and the app shows a purple bar so opponents can see it.
// Turning it on or off is recorded in each round doc's log.

const KEY = 'pp-round-mode';
const changed = createSignal();

function load(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

let on = load();

export function isRoundMode() {
  return on;
}

export function useRoundMode(): boolean {
  return useSyncExternalStore(changed.subscribe, isRoundMode);
}

/** Switch Round Mode, recording it in the given round docs' logs. */
export function setRoundMode(next: boolean, roundDocIds: string[]) {
  if (next === on) return;
  on = next;
  try {
    localStorage.setItem(KEY, next ? '1' : '0');
  } catch {
    // ignore
  }
  for (const id of roundDocIds) logEvent(id, { k: next ? 'roundmode-on' : 'roundmode-off' });
  changed.emit();
}
