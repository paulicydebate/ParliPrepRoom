import { useSyncExternalStore } from 'react';
import { createSignal } from './emitter';

// "Night" flow: the flow area is dark with thin colored outlines (like a night-mode flowing app),
// whatever the rest of the app uses. "Match app" follows the app's light/dark choice instead.

export type FlowTheme = 'night' | 'app';
const KEY = 'pp-flow-theme';
const changed = createSignal();

function read(): FlowTheme {
  try {
    return localStorage.getItem(KEY) === 'app' ? 'app' : 'night';
  } catch {
    return 'night';
  }
}
let theme: FlowTheme = read();

export const getFlowTheme = () => theme;
export function setFlowTheme(next: FlowTheme) {
  theme = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* ignore */
  }
  changed.emit();
}
export function useFlowTheme(): FlowTheme {
  return useSyncExternalStore(changed.subscribe, getFlowTheme);
}
