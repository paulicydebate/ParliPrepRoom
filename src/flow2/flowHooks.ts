import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import * as Y from 'yjs';
import type { WebsocketProvider } from 'y-websocket';
import { recordEdit } from '../editor/roundGuard';
import { isRound } from '../store/roundDoc';
import { logEvent } from '../store/typingLog';
import {
  observeFlow,
  ORIGIN_LOCAL,
  readFlow,
  sheetOrder,
  sheetsMap,
  type FlowMark,
  type FlowSheetData,
} from './model';

// Hooks the flow editor shares: the flow as React state, undo, and who else is where.

export function useFlow(doc: Y.Doc): FlowSheetData[] {
  const version = useRef(0);
  const cache = useRef<{ v: number; data: FlowSheetData[] } | null>(null);
  const subscribe = useCallback(
    (fn: () => void) =>
      observeFlow(doc, () => {
        version.current++;
        fn();
      }),
    [doc],
  );
  const get = () => {
    if (!cache.current || cache.current.v !== version.current) cache.current = { v: version.current, data: readFlow(doc) };
    return cache.current.data;
  };
  return useSyncExternalStore(subscribe, get);
}

const undoUsers = new WeakMap<Y.UndoManager, number>();

export function useUndo(doc: Y.Doc, docId: string) {
  const undo = useMemo(
    () =>
      new Y.UndoManager([sheetOrder(doc), sheetsMap(doc)], {
        trackedOrigins: new Set<unknown>([ORIGIN_LOCAL, HTMLTextAreaElement]),
        captureTimeout: 600,
      }),
    [doc],
  );
  // Each change to the flow's shape (a new cell, a delete, a link, a mark...) starts its own undo step. Without this,
  // steady typing with Tab and Enter never pauses long enough to split, and one Undo would take back a whole speech.
  useEffect(() => {
    const split = (tr: Y.Transaction) => {
      if (tr.origin === ORIGIN_LOCAL) undo.stopCapturing();
    };
    doc.on('beforeTransaction', split);
    // Round docs: what Undo and Redo put back or take out goes in the typing log like any other edit, and switching
    // "Round doc" on or off forgets the undo history, so text removed before the round cannot be brought back unlogged.
    const logUndo = (events: Y.YEvent<Y.AbstractType<unknown>>[], tr: Y.Transaction) => {
      if (tr.origin !== undo || !isRound(doc)) return;
      for (const ev of events) {
        if (!(ev.target instanceof Y.Text)) continue;
        let ins = '';
        let del = 0;
        for (const d of ev.delta) {
          if (typeof d.insert === 'string') ins += d.insert;
          if (d.delete) del += d.delete;
        }
        if (del) logEvent(docId, { k: 'delete', n: del, s: '(undo or redo)' });
        if (ins) recordEdit(docId, ins, '');
      }
    };
    sheetsMap(doc).observeDeep(logUndo);
    const settings = doc.getMap('settings');
    const onSettings = (ev: Y.YMapEvent<unknown>) => {
      if (ev.keysChanged.has('round')) undo.clear();
    };
    settings.observe(onSettings);
    return () => {
      doc.off('beforeTransaction', split);
      sheetsMap(doc).unobserveDeep(logUndo);
      settings.unobserve(onSettings);
    };
  }, [doc, undo, docId]);
  // Let go of the undo history when the flow closes. (Checked a moment later: React's development mode unmounts and
  // mounts every component once on purpose, and the same manager must survive that.)
  useEffect(() => {
    undoUsers.set(undo, (undoUsers.get(undo) ?? 0) + 1);
    return () => {
      undoUsers.set(undo, (undoUsers.get(undo) ?? 1) - 1);
      setTimeout(() => {
        if (!undoUsers.get(undo)) undo.destroy();
      }, 0);
    };
  }, [undo]);
  return undo;
}

/** The flow that was last clicked or typed in: Undo and Redo go to it when no cell has the caret. */
export let lastWorkspace: HTMLElement | null = null;
export const setLastWorkspace = (el: HTMLElement | null) => (lastWorkspace = el);
export const MARK_GLYPH: Record<FlowMark, string> = { extended: '→', dropped: '!', answered: '✓', key: '★' };
export const MARK_LABEL: Record<FlowMark, string> = { extended: 'Extended', dropped: 'Dropped', answered: 'Answered', key: 'Key argument' };

export type Peer = { name: string; color: string; at?: number };

/** Who else is in which cell right now (from the live connection's presence), by cell id. */
export function usePeers(provider: WebsocketProvider | null): ReadonlyMap<string, Peer[]> {
  const [peers, setPeers] = useState<ReadonlyMap<string, Peer[]>>(new Map());
  useEffect(() => {
    if (!provider) return setPeers(new Map());
    const aw = provider.awareness;
    const read = () => {
      const out = new Map<string, Peer[]>();
      aw.getStates().forEach((state, client) => {
        if (client === aw.clientID) return;
        const at = (state as { flow2?: { cell?: string; at?: number } | null }).flow2;
        const user = (state as { user?: { name?: string; color?: string } }).user;
        if (!at?.cell || !user) return;
        out.set(at.cell, [...(out.get(at.cell) ?? []), { name: user.name || 'Someone', color: user.color || '#888', at: typeof at.at === 'number' ? at.at : undefined }]);
      });
      setPeers((prev) => {
        const same = prev.size === out.size && [...out].every(([k, v]) => prev.get(k)?.map((p) => p.name + p.color + p.at).join() === v.map((p) => p.name + p.color + p.at).join());
        return same ? prev : out;
      });
    };
    read();
    aw.on('change', read);
    return () => aw.off('change', read);
  }, [provider]);
  return peers;
}

