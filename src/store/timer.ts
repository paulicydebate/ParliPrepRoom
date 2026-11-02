import { useEffect, useState } from 'react';
import type * as Y from 'yjs';
import { serverNow } from './account';

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

/** NPDA times, plus the 2- and 1-minute flex periods. */
export const PRESETS: Preset[] = [
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
