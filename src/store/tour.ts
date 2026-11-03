import { useSyncExternalStore } from 'react';
import { createSignal } from './emitter';

// The short tour: whether it's showing, and whether this browser has been
// offered it already (so the "take a tour?" prompt appears only once).

const changed = createSignal();
const SEEN_KEY = 'pp-tour-seen';
let open = false;

export function startTour() {
  open = true;
  markTourSeen();
  changed.emit();
}

export function endTour() {
  open = false;
  changed.emit();
}

export function useTourOpen(): boolean {
  return useSyncExternalStore(changed.subscribe, () => open);
}

export function tourSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return true; // can't remember: don't nag
  }
}

export function markTourSeen() {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    // ignore
  }
}
