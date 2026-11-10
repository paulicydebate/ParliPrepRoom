import { useSyncExternalStore } from 'react';
import type { OutlineEntry } from '../model/outline';
import type { DocMeta } from './docs';
import { createSignal } from './emitter';

// What the pins column inside a flow needs from the rest of the app, and what the pin board needs to know
// about the flows that are open. Small shared stores so the flow does not have to be passed everything.

// ---- Open flows: sheet names and the sheet in view, by doc id ----
export interface OpenFlow {
  sheets: string[];
  active: string;
}
const flowsChanged = createSignal();
let flows = new Map<string, OpenFlow>();

export function publishFlow(docId: string, info: OpenFlow | null) {
  const old = flows.get(docId);
  if (!info && !old) return;
  if (info && old && old.active === info.active && old.sheets.join('\u0000') === info.sheets.join('\u0000')) return;
  const next = new Map(flows);
  if (info) next.set(docId, info);
  else next.delete(docId);
  flows = next;
  flowsChanged.emit();
}
export function useOpenFlows(): ReadonlyMap<string, OpenFlow> {
  return useSyncExternalStore(flowsChanged.subscribe, () => flows);
}

// ---- Library: the searchable docs and their outlines (set by the app while the finder or pins are open) ----
export interface LibraryView {
  docs: DocMeta[];
  index: Map<string, OutlineEntry[]>;
}
const libChanged = createSignal();
let lib: LibraryView = { docs: [], index: new Map() };
export function setLibraryView(v: LibraryView) {
  if (v.docs === lib.docs && v.index === lib.index) return;
  lib = v;
  libChanged.emit();
}
export function useLibraryView(): LibraryView {
  return useSyncExternalStore(libChanged.subscribe, () => lib);
}

// ---- Pins columns open: the app keeps the docs indexed while any flow shows one ----
const colsChanged = createSignal();
const open = new Set<string>();
export function setPinColumnOpen(key: string, on: boolean) {
  if (on === open.has(key)) return;
  if (on) open.add(key);
  else open.delete(key);
  count = open.size;
  colsChanged.emit();
}
let count = 0;
export function usePinColumnsOpen(): boolean {
  return useSyncExternalStore(colsChanged.subscribe, () => count > 0);
}
