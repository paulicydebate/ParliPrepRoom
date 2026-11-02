import { useSyncExternalStore } from 'react';
import { BLOCK_KINDS, type BlockKind } from '../model/blocks';
import { createSignal } from '../store/emitter';

// Look-and-feel settings. They live in this browser only (like Google Docs'
// view settings), never inside a document, so partners can each read prep
// in the fonts they like.

export type Theme = 'system' | 'light' | 'dark' | 'sepia';

export interface StyleSetting {
  font: string;
  size: number;
  /** null = the theme's text color. */
  color: string | null;
  bold: boolean;
  italic: boolean;
  underline: boolean;
}

export interface Settings {
  theme: Theme;
  styles: Record<BlockKind, StyleSetting>;
}

export const FONTS: { label: string; stack: string }[] = [
  { label: 'Inter', stack: "'Inter', system-ui, sans-serif" },
  { label: 'IBM Plex Sans', stack: "'IBM Plex Sans', system-ui, sans-serif" },
  { label: 'Atkinson Hyperlegible', stack: "'Atkinson Hyperlegible', system-ui, sans-serif" },
  { label: 'Source Serif', stack: "'Source Serif 4', Georgia, serif" },
  { label: 'Literata', stack: "'Literata', Georgia, serif" },
  { label: 'Lora', stack: "'Lora', Georgia, serif" },
  { label: 'Merriweather', stack: "'Merriweather', Georgia, serif" },
  { label: 'JetBrains Mono', stack: "'JetBrains Mono', ui-monospace, monospace" },
  { label: 'Arial', stack: 'Arial, Helvetica, sans-serif' },
  { label: 'Calibri', stack: "Calibri, Carlito, 'Segoe UI', sans-serif" },
  { label: 'Georgia', stack: 'Georgia, serif' },
  { label: 'Times New Roman', stack: "'Times New Roman', Times, serif" },
];

export function fontStack(label: string): string {
  return FONTS.find((f) => f.label === label)?.stack ?? FONTS[0].stack;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  styles: {
    position: { font: 'Inter', size: 26, color: null, bold: true, italic: false, underline: false },
    section: { font: 'Inter', size: 20, color: null, bold: true, italic: false, underline: false },
    claim: { font: 'Inter', size: 16.5, color: null, bold: true, italic: false, underline: false },
    warrant: { font: 'Source Serif', size: 16.5, color: null, bold: false, italic: false, underline: false },
    analytic: { font: 'Inter', size: 15.5, color: null, bold: false, italic: false, underline: false },
    note: { font: 'Inter', size: 14, color: null, bold: false, italic: true, underline: false },
  },
};

const KEY = 'pp-settings-v1';
const changed = createSignal();

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const styles = { ...DEFAULT_SETTINGS.styles };
    for (const k of BLOCK_KINDS) styles[k] = { ...styles[k], ...(parsed.styles?.[k] ?? {}) };
    return { theme: parsed.theme ?? DEFAULT_SETTINGS.theme, styles };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

let current: Settings = load();

export function getSettings() {
  return current;
}

export function updateSettings(next: Settings) {
  current = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private mode etc.: settings just won't persist.
  }
  applySettings(next);
  changed.emit();
}

export function useSettings(): Settings {
  return useSyncExternalStore(changed.subscribe, getSettings);
}

/** Push settings into CSS variables on <html>. */
export function applySettings(s: Settings) {
  const root = document.documentElement;
  root.dataset.theme = s.theme === 'system' ? '' : s.theme;
  if (s.theme === 'system') delete root.dataset.theme;
  for (const k of BLOCK_KINDS) {
    const st = s.styles[k];
    root.style.setProperty(`--pp-${k}-font`, fontStack(st.font));
    root.style.setProperty(`--pp-${k}-size`, `${st.size}px`);
    root.style.setProperty(`--pp-${k}-weight`, st.bold ? '700' : '400');
    root.style.setProperty(`--pp-${k}-style`, st.italic ? 'italic' : 'normal');
    root.style.setProperty(`--pp-${k}-decoration`, st.underline ? 'underline' : 'none');
    if (st.color) root.style.setProperty(`--pp-${k}-color`, st.color);
    else root.style.removeProperty(`--pp-${k}-color`);
  }
}
