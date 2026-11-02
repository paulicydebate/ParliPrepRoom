import { useSyncExternalStore } from 'react';
import { createSignal } from './emitter';

// Pin board: the blocks a speaker plans to read, in order, sorted into named
// groups that can match flow sheets ("T", "DA 1"...). Stored per device and
// per team. Pins point at blocks (doc id + block id); they never copy text.

export interface Pin {
  docId: string;
  blockId: string;
  /** Group name, e.g. "T". Undefined = no group. */
  group?: string;
}

interface Board {
  pins: Pin[];
  /** Group names in order (including groups with no pins yet). */
  groups: string[];
  /** Selected tab: a group name, or '' for All. */
  selected: string;
  /** Switch tabs to match the flow sheet you're on. */
  followFlow: boolean;
}

const changed = createSignal();
const key = (space: string) => `pp-pins-${space}`;
const cache = new Map<string, Board>();

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const samePin = (a: Pin, b: Pin) => a.docId === b.docId && a.blockId === b.blockId;

export function getBoard(space: string): Board {
  if (!cache.has(space)) {
    let board: Board = { pins: [], groups: [], selected: '', followFlow: true };
    try {
      const raw = JSON.parse(localStorage.getItem(key(space)) ?? 'null') as Board | Pin[] | null;
      if (Array.isArray(raw)) board.pins = raw; // older format: a plain list
      else if (raw) board = { ...board, ...raw };
    } catch {
      // ignore
    }
    cache.set(space, board);
  }
  return cache.get(space)!;
}

function save(space: string, board: Board) {
  cache.set(space, board);
  try {
    localStorage.setItem(key(space), JSON.stringify(board));
  } catch {
    // ignore
  }
  changed.emit();
}

export function useBoard(space: string): Board {
  return useSyncExternalStore(changed.subscribe, () => getBoard(space));
}

/** Pins shown under the selected tab. */
export function visiblePins(board: Board): Pin[] {
  return board.selected ? board.pins.filter((p) => p.group && same(p.group, board.selected)) : board.pins;
}

export const isPinned = (space: string, p: Pin) => getBoard(space).pins.some((x) => samePin(x, p));

/** Pin (into the selected group) or unpin. */
export function togglePin(space: string, p: Pin) {
  const b = getBoard(space);
  if (b.pins.some((x) => samePin(x, p))) save(space, { ...b, pins: b.pins.filter((x) => !samePin(x, p)) });
  else save(space, { ...b, pins: [...b.pins, { docId: p.docId, blockId: p.blockId, group: b.selected || undefined }] });
}

/** Move a pin up or down within the list shown under the current tab. */
export function movePin(space: string, p: Pin, delta: number) {
  const b = getBoard(space);
  const shown = visiblePins(b);
  const i = shown.findIndex((x) => samePin(x, p));
  const other = shown[i + delta];
  if (i < 0 || !other) return;
  const pins = [...b.pins];
  const a = pins.findIndex((x) => samePin(x, p));
  const c = pins.findIndex((x) => samePin(x, other));
  [pins[a], pins[c]] = [pins[c], pins[a]];
  save(space, { ...b, pins });
}

export function setPinGroup(space: string, p: Pin, group: string | undefined) {
  const b = getBoard(space);
  const name = group?.trim() || undefined;
  const groups = name && !b.groups.some((g) => same(g, name)) ? [...b.groups, name] : b.groups;
  save(space, { ...b, groups, pins: b.pins.map((x) => (samePin(x, p) ? { ...x, group: name } : x)) });
}

export function addGroup(space: string, name: string) {
  const b = getBoard(space);
  const clean = name.trim();
  if (!clean) return;
  const existing = b.groups.find((g) => same(g, clean));
  save(space, { ...b, groups: existing ? b.groups : [...b.groups, clean], selected: existing ?? clean });
}

/** Remove a group; its pins stay, ungrouped. */
export function removeGroup(space: string, name: string) {
  const b = getBoard(space);
  save(space, {
    ...b,
    groups: b.groups.filter((g) => !same(g, name)),
    pins: b.pins.map((p) => (p.group && same(p.group, name) ? { ...p, group: undefined } : p)),
    selected: same(b.selected, name) ? '' : b.selected,
  });
}

export function selectGroup(space: string, name: string) {
  const b = getBoard(space);
  if (b.selected !== name) save(space, { ...b, selected: name });
}

export function setFollowFlow(space: string, on: boolean) {
  save(space, { ...getBoard(space), followFlow: on });
}

/** Called when the flow sheet in view changes: show the group with the same name, if there is one. */
export function followSheet(space: string, sheetTitle: string) {
  const b = getBoard(space);
  if (!b.followFlow) return;
  const match = b.groups.find((g) => same(g, sheetTitle)) ?? b.pins.find((p) => p.group && same(p.group, sheetTitle))?.group;
  if (match && !same(match, b.selected)) save(space, { ...b, selected: match });
}

export function clearPins(space: string) {
  const b = getBoard(space);
  save(space, { ...b, pins: b.selected ? b.pins.filter((p) => !(p.group && same(p.group, b.selected))) : [] });
}

/** For components that only need to re-render when pins change. */
export function usePins(space: string): Pin[] {
  return useBoard(space).pins;
}
