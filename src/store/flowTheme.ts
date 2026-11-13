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

// Which colors the flow's two sides use: Flowist's cyan and red, or the app's own Gov and Opp
// colorway (blue and red by default, and the other pairs in the Colors window).
export type FlowColors = 'flowist' | 'colorway';
const COLORS_KEY = 'pp-flow-colors';

function readColors(): FlowColors {
  try {
    return localStorage.getItem(COLORS_KEY) === 'colorway' ? 'colorway' : 'flowist';
  } catch {
    return 'flowist';
  }
}
let colors: FlowColors = readColors();

export const getFlowColors = () => colors;
export function setFlowColors(next: FlowColors) {
  colors = next;
  try {
    localStorage.setItem(COLORS_KEY, next);
  } catch {
    /* ignore */
  }
  changed.emit();
}
export function useFlowColors(): FlowColors {
  return useSyncExternalStore(changed.subscribe, getFlowColors);
}
