import { BLOCK_KINDS, KIND_INFO, type BlockKind } from '../model/blocks';

// Keys that apply a named style. Browsers reserve Cmd+1–9 (Mac) and
// Ctrl+1–9 (Windows/Chromebook) for switching tabs, so each platform gets a
// different default, and the Appearance settings let people pick another set.

export type StyleKeyPreset = 'ctrl' | 'alt' | 'modalt' | 'fkeys';

const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
export const isMac = /Mac|iPhone|iPad/.test(ua);
export const isChromeOS = /CrOS/.test(ua);

export function defaultPreset(): StyleKeyPreset {
  if (isMac) return 'ctrl';
  if (isChromeOS) return 'modalt';
  return 'alt';
}

export const PRESET_LABELS: Record<StyleKeyPreset, string> = {
  ctrl: isMac ? 'Control + 1–6' : 'Ctrl + 1–6 (replaces tab switching)',
  alt: isMac ? 'Option + 1–6' : 'Alt + 1–6',
  modalt: isMac ? 'Cmd + Option + 1–6' : 'Ctrl + Alt + 1–6',
  fkeys: 'F4–F9 (Verbatim style)',
};

let current: StyleKeyPreset = defaultPreset();

export function setStyleKeyPreset(p: StyleKeyPreset) {
  current = p;
}

export function getStyleKeyPreset() {
  return current;
}

const index = (kind: BlockKind) => Number(KIND_INFO[kind].key);

/** Short label for menus, e.g. "⌃1" or "F4". */
export function styleKeyLabel(kind: BlockKind, preset: StyleKeyPreset = current): string {
  const n = index(kind);
  switch (preset) {
    case 'ctrl':
      return isMac ? `⌃${n}` : `Ctrl+${n}`;
    case 'alt':
      return isMac ? `⌥${n}` : `Alt+${n}`;
    case 'modalt':
      return isMac ? `⌘⌥${n}` : `Ctrl+Alt+${n}`;
    case 'fkeys':
      return `F${n + 3}`;
  }
}

/** Which style a key press asks for under the given preset, if any. */
export function styleForKey(e: KeyboardEvent, preset: StyleKeyPreset = current): BlockKind | null {
  let n: number | null = null;
  if (preset === 'fkeys') {
    const m = /^F(\d+)$/.exec(e.key);
    if (!m || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return null;
    n = Number(m[1]) - 3;
  } else {
    // event.code is layout-independent; Option+1 on a Mac types "¡" in event.key.
    const m = /^(?:Digit|Numpad)(\d)$/.exec(e.code);
    if (!m || e.shiftKey) return null;
    n = Number(m[1]);
    const ctrl = e.ctrlKey;
    const alt = e.altKey;
    const meta = e.metaKey;
    const ok =
      preset === 'ctrl'
        ? ctrl && !alt && !meta
        : preset === 'alt'
          ? alt && !ctrl && !meta
          : isMac
            ? meta && alt && !ctrl
            : ctrl && alt && !meta;
    if (!ok) return null;
  }
  return BLOCK_KINDS.find((k) => index(k) === n) ?? null;
}
