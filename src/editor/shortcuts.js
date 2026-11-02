import { BLOCK_KINDS, KIND_INFO } from '../model/blocks';
const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
export const isMac = /Mac|iPhone|iPad/.test(ua);
export const isChromeOS = /CrOS/.test(ua);
export function defaultPreset() {
    if (isMac)
        return 'ctrl';
    if (isChromeOS)
        return 'modalt';
    return 'alt';
}
export const PRESET_LABELS = {
    ctrl: isMac ? 'Control + 1–6' : 'Ctrl + 1–6 (replaces tab switching)',
    alt: isMac ? 'Option + 1–6' : 'Alt + 1–6',
    modalt: isMac ? 'Cmd + Option + 1–6' : 'Ctrl + Alt + 1–6',
    fkeys: 'F4–F9 (Verbatim style)',
};
let current = defaultPreset();
export function setStyleKeyPreset(p) {
    current = p;
}
export function getStyleKeyPreset() {
    return current;
}
const index = (kind) => Number(KIND_INFO[kind].key);
/** Short label for menus, e.g. "⌃1" or "F4". */
export function styleKeyLabel(kind, preset = current) {
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
export function styleForKey(e, preset = current) {
    let n = null;
    if (preset === 'fkeys') {
        const m = /^F(\d+)$/.exec(e.key);
        if (!m || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey)
            return null;
        n = Number(m[1]) - 3;
    }
    else {
        // event.code is layout-independent; Option+1 on a Mac types "¡" in event.key.
        const m = /^(?:Digit|Numpad)(\d)$/.exec(e.code);
        if (!m || e.shiftKey)
            return null;
        n = Number(m[1]);
        const ctrl = e.ctrlKey;
        const alt = e.altKey;
        const meta = e.metaKey;
        const ok = preset === 'ctrl'
            ? ctrl && !alt && !meta
            : preset === 'alt'
                ? alt && !ctrl && !meta
                : isMac
                    ? meta && alt && !ctrl
                    : ctrl && alt && !meta;
        if (!ok)
            return null;
    }
    return BLOCK_KINDS.find((k) => index(k) === n) ?? null;
}
