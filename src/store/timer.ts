import { useEffect, useState } from 'react';
import type * as Y from 'yjs';
import { serverNow } from './account';
import { createSignal } from './emitter';

// The prep and speech timer. On a round doc it's stored inside the doc (a Yjs
// map), so partners see the same countdown; otherwise it's per device.

export interface TimerState {
  label: string;
  durationMs: number;
  /** When running: the server-clock time it hits zero. */
  endsAt: number | null;
  /** When paused: time left. */
  remainingMs: number;
}

export interface Preset {
  label: string;
  minutes: number;
}

/** NPDA times, plus the 2- and 1-minute flex periods. Each device can change them. */
export const DEFAULT_PRESETS: Preset[] = [
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
export function loadPresets(): Preset[] {
  try {
    const saved = JSON.parse(localStorage.getItem(PRESETS_KEY) ?? 'null') as Preset[] | null;
    if (Array.isArray(saved) && saved.length && saved.every((p) => typeof p.label === 'string' && p.minutes > 0)) return saved;
  } catch {
    // ignore
  }
  return DEFAULT_PRESETS;
}

export function savePresets(presets: Preset[] | null) {
  try {
    if (presets) localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
    else localStorage.removeItem(PRESETS_KEY);
  } catch {
    // ignore
  }
  presetsChanged.emit();
}

export function usePresets(): Preset[] {
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
export function parseMinutes(text: string): number | null {
  const t = text.trim();
  let m: number;
  const colon = /^(\d{1,3}):([0-5]?\d)$/.exec(t);
  if (colon) m = Number(colon[1]) + Number(colon[2]) / 60;
  else if (/^\d+(\.\d+)?$|^\.\d+$/.test(t)) m = Number(t);
  else return null;
  return m > 0 && m <= 180 ? m : null;
}

/** "25", "2:30", "0:45": minutes the way a person would write them. */
export function formatMinutes(minutes: number): string {
  const secs = Math.round(minutes * 60);
  return secs % 60 === 0 ? String(secs / 60) : format(secs * 1000);
}

const DEFAULT: TimerState = { label: 'Prep', durationMs: 20 * 60_000, endsAt: null, remainingMs: 20 * 60_000 };
const LOCAL_KEY = 'pp-timer-v1';

function readLocal(): TimerState {
  try {
    return { ...DEFAULT, ...(JSON.parse(localStorage.getItem(LOCAL_KEY) ?? 'null') ?? {}) };
  } catch {
    return DEFAULT;
  }
}

function readMap(map: Y.Map<unknown>): TimerState {
  const raw = map.get('state') as Partial<TimerState> | undefined;
  return raw ? { ...DEFAULT, ...raw } : DEFAULT;
}

export function timeLeft(t: TimerState, now = serverNow()): number {
  return t.endsAt !== null ? Math.max(0, t.endsAt - now) : t.remainingMs;
}

export interface TimerApi {
  state: TimerState;
  /** Shared with everyone on the round doc. */
  shared: boolean;
  set: (next: TimerState) => void;
}

/** The timer for a round doc (shared) or this device. */
export function useTimer(doc: Y.Doc | null): TimerApi {
  const map = doc ? doc.getMap('timer') : null;
  const [state, setState] = useState<TimerState>(() => (map ? readMap(map) : readLocal()));
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
  const set = (next: TimerState) => {
    setState(next);
    if (map) map.set('state', next);
    else {
      try {
        localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
    }
  };
  return { state, shared: !!map, set };
}

export const start = (t: TimerState): TimerState => ({ ...t, endsAt: serverNow() + timeLeft(t) });
export const pause = (t: TimerState): TimerState => ({ ...t, endsAt: null, remainingMs: timeLeft(t) });
export const reset = (t: TimerState): TimerState => ({ ...t, endsAt: null, remainingMs: t.durationMs });
/** Add or take away time (running or paused), never below zero. */
export const adjust = (t: TimerState, deltaMs: number): TimerState => {
  const left = Math.max(0, timeLeft(t) + deltaMs);
  return t.endsAt !== null ? { ...t, endsAt: serverNow() + left } : { ...t, remainingMs: left };
};
export const choose = (label: string, minutes: number, run: boolean): TimerState => {
  const ms = Math.round(minutes * 60_000);
  return { label, durationMs: ms, remainingMs: ms, endsAt: run ? serverNow() + ms : null };
};

export function format(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
