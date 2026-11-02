import { useEffect, useState } from 'react';
import { serverNow } from './account';
import { createSignal } from './emitter';
/** NPDA times, plus the 2- and 1-minute flex periods. Each device can change them. */
export const DEFAULT_PRESETS = [
    { label: 'Prep', minutes: 20 },
    { label: 'PMC', minutes: 7 },
    { label: 'LOC', minutes: 8 },
    { label: 'MG', minutes: 8 },
    { label: 'MO', minutes: 8 },
    { label: 'LOR', minutes: 4 },
    { label: 'PMR', minutes: 5 },
    { label: 'Flex', minutes: 2 },
    { label: 'Flex', minutes: 1 },
];
const PRESETS_KEY = 'pp-timer-presets-v1';
const presetsChanged = createSignal();
/** The preset buttons, with this device's own times. */
export function loadPresets() {
    try {
        const saved = JSON.parse(localStorage.getItem(PRESETS_KEY) ?? 'null');
        if (Array.isArray(saved) && saved.length && saved.every((p) => typeof p.label === 'string' && p.minutes > 0))
            return saved;
    }
    catch {
        // ignore
    }
    return DEFAULT_PRESETS;
}
export function savePresets(presets) {
    try {
        if (presets)
            localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
        else
            localStorage.removeItem(PRESETS_KEY);
    }
    catch {
        // ignore
    }
    presetsChanged.emit();
}
export function usePresets() {
    const [presets, setPresets] = useState(loadPresets);
    useEffect(() => presetsChanged.subscribe(() => setPresets(loadPresets())), []);
    return presets;
}
/** This device's prep time in minutes (used by New round). */
export const prepMinutes = () => loadPresets().find((p) => p.label.toLowerCase() === 'prep')?.minutes ?? 20;
/**
 * Read a length typed by a person: "25" (minutes), "2.5", "2:30" or "0:45".
 * Returns minutes, or null if it isn't a usable length (over 0, up to 3 hours).
 */
export function parseMinutes(text) {
    const t = text.trim();
    let m;
    const colon = /^(\d{1,3}):([0-5]?\d)$/.exec(t);
    if (colon)
        m = Number(colon[1]) + Number(colon[2]) / 60;
    else if (/^\d+(\.\d+)?$|^\.\d+$/.test(t))
        m = Number(t);
    else
        return null;
    return m > 0 && m <= 180 ? m : null;
}
/** "25", "2:30", "0:45": minutes the way a person would write them. */
export function formatMinutes(minutes) {
    const secs = Math.round(minutes * 60);
    return secs % 60 === 0 ? String(secs / 60) : format(secs * 1000);
}
const DEFAULT = { label: 'Prep', durationMs: 20 * 60_000, endsAt: null, remainingMs: 20 * 60_000 };
const LOCAL_KEY = 'pp-timer-v1';
function readLocal() {
    try {
        return { ...DEFAULT, ...(JSON.parse(localStorage.getItem(LOCAL_KEY) ?? 'null') ?? {}) };
    }
    catch {
        return DEFAULT;
    }
}
function readMap(map) {
    const raw = map.get('state');
    return raw ? { ...DEFAULT, ...raw } : DEFAULT;
}
export function timeLeft(t, now = serverNow()) {
    return t.endsAt !== null ? Math.max(0, t.endsAt - now) : t.remainingMs;
}
/** The timer for a round doc (shared) or this device. */
export function useTimer(doc) {
    const map = doc ? doc.getMap('timer') : null;
    const [state, setState] = useState(() => (map ? readMap(map) : readLocal()));
    useEffect(() => {
        if (!map) {
            setState(readLocal());
            return;
        }
        const update = () => setState(readMap(map));
        update();
        map.observe(update);
        return () => map.unobserve(update);
    }, [map]);
    const set = (next) => {
        setState(next);
        if (map)
            map.set('state', next);
        else {
            try {
                localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
            }
            catch {
                // ignore
            }
        }
    };
    return { state, shared: !!map, set };
}
export const start = (t) => ({ ...t, endsAt: serverNow() + timeLeft(t) });
export const pause = (t) => ({ ...t, endsAt: null, remainingMs: timeLeft(t) });
export const reset = (t) => ({ ...t, endsAt: null, remainingMs: t.durationMs });
/** Add or take away time (running or paused), never below zero. */
export const adjust = (t, deltaMs) => {
    const left = Math.max(0, timeLeft(t) + deltaMs);
    return t.endsAt !== null ? { ...t, endsAt: serverNow() + left } : { ...t, remainingMs: left };
};
export const choose = (label, minutes, run) => {
    const ms = Math.round(minutes * 60_000);
    return { label, durationMs: ms, remainingMs: ms, endsAt: run ? serverNow() + ms : null };
};
export function format(ms) {
    const total = Math.ceil(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
}
