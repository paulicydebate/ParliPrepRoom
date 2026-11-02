import { useSyncExternalStore } from 'react';
import { BLOCK_KINDS } from '../model/blocks';
import { createSignal } from '../store/emitter';
import { DEFAULT_COLORWAY, resolveColorway } from './colorways';
import { defaultPreset, setStyleKeyPreset } from '../editor/shortcuts';
export const FONTS = [
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
export function fontStack(label) {
    return FONTS.find((f) => f.label === label)?.stack ?? FONTS[0].stack;
}
export const DEFAULT_SETTINGS = {
    theme: 'system',
    styleKeys: defaultPreset(),
    colorway: DEFAULT_COLORWAY,
    customColors: { gov: '#1f5fc9', opp: '#c62828' },
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
function load() {
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw)
            return DEFAULT_SETTINGS;
        const parsed = JSON.parse(raw);
        const styles = { ...DEFAULT_SETTINGS.styles };
        for (const k of BLOCK_KINDS)
            styles[k] = { ...styles[k], ...(parsed.styles?.[k] ?? {}) };
        return {
            theme: parsed.theme ?? DEFAULT_SETTINGS.theme,
            styleKeys: parsed.styleKeys ?? DEFAULT_SETTINGS.styleKeys,
            colorway: parsed.colorway ?? DEFAULT_SETTINGS.colorway,
            customColors: { ...DEFAULT_SETTINGS.customColors, ...(parsed.customColors ?? {}) },
            styles,
        };
    }
    catch {
        return DEFAULT_SETTINGS;
    }
}
let current = load();
export function getSettings() {
    return current;
}
export function updateSettings(next) {
    current = next;
    try {
        localStorage.setItem(KEY, JSON.stringify(next));
    }
    catch {
        // Private mode etc.: settings just won't persist.
    }
    applySettings(next);
    changed.emit();
}
export function useSettings() {
    return useSyncExternalStore(changed.subscribe, getSettings);
}
/** Push settings into CSS variables on <html>. */
export function applySettings(s) {
    setStyleKeyPreset(s.styleKeys);
    const root = document.documentElement;
    root.dataset.theme = s.theme === 'system' ? '' : s.theme;
    if (s.theme === 'system')
        delete root.dataset.theme;
    const cw = resolveColorway(s.colorway, s.customColors);
    root.style.setProperty('--gov-l', cw.gov.light);
    root.style.setProperty('--gov-d', cw.gov.dark);
    root.style.setProperty('--opp-l', cw.opp.light);
    root.style.setProperty('--opp-d', cw.opp.dark);
    for (const k of BLOCK_KINDS) {
        const st = s.styles[k];
        root.style.setProperty(`--pp-${k}-font`, fontStack(st.font));
        root.style.setProperty(`--pp-${k}-size`, `${st.size}px`);
        root.style.setProperty(`--pp-${k}-weight`, st.bold ? '700' : '400');
        root.style.setProperty(`--pp-${k}-style`, st.italic ? 'italic' : 'normal');
        root.style.setProperty(`--pp-${k}-decoration`, st.underline ? 'underline' : 'none');
        if (st.color)
            root.style.setProperty(`--pp-${k}-color`, st.color);
        else
            root.style.removeProperty(`--pp-${k}-color`);
    }
}
