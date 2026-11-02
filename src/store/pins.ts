import { useSyncExternalStore } from 'react';
import { createSignal } from './emitter';

// Pin board: the blocks a speaker plans to read, in order. Stored per device
// and per team. Pins point at blocks (doc id + block id); they never copy text.

export interface Pin {
  docId: string;
  blockId: string;
}

const changed = createSignal();
const key = (space: string) => `pp-pins-${space}`;
const cache = new Map<string, Pin[]>();

export function getPins(space: string): Pin[] {
  if (!cache.has(space)) {
    let list: Pin[] = [];
    try {
      list = JSON.parse(localStorage.getItem(key(space)) ?? '[]') as Pin[];
    } catch {
      list = [];
    }
    cache.set(space, Array.isArray(list) ? list : []);
  }
  return cache.get(space)!;
}

function save(space: string, list: Pin[]) {
  cache.set(space, list);
  try {
    localStorage.setItem(key(space), JSON.stringify(list));
  } catch {
    // ignore
  }
  changed.emit();
}

export function usePins(space: string): Pin[] {
  return useSyncExternalStore(changed.subscribe, () => getPins(space));
}

export const isPinned = (space: string, p: Pin) => getPins(space).some((x) => x.docId === p.docId && x.blockId === p.blockId);

export function togglePin(space: string, p: Pin) {
  const list = getPins(space);
  save(space, isPinned(space, p) ? list.filter((x) => !(x.docId === p.docId && x.blockId === p.blockId)) : [...list, p]);
}

export function movePin(space: string, index: number, delta: number) {
  const list = [...getPins(space)];
  const to = index + delta;
  if (to < 0 || to >= list.length) return;
  [list[index], list[to]] = [list[to], list[index]];
  save(space, list);
}

export function clearPins(space: string) {
  save(space, []);
}
