import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state';
import { ReplaceAroundStep, ReplaceStep } from '@tiptap/pm/transform';
import { ySyncPluginKey } from '@tiptap/y-tiptap';
import type * as Y from 'yjs';
import { isRound } from '../store/roundDoc';
import { logEvent } from '../store/typingLog';

// In a round doc: block paste and drag-and-drop into the doc, and log every
// local edit to the typing log. Team docs are untouched.

/** One edit beyond this many inserted characters is flagged for review. */
export const LARGE_INSERT = 40;

export function toast(message: string) {
  window.dispatchEvent(new CustomEvent('pp-toast', { detail: message }));
}

/** Text inserted and text removed by a transaction. */
export function editsOf(tr: Transaction): { inserted: string; removed: number; removedText: string } {
  let inserted = '';
  let removed = 0;
  let removedText = '';
  tr.steps.forEach((step, i) => {
    if (!(step instanceof ReplaceStep || step instanceof ReplaceAroundStep)) return;
    const { from, to, slice } = step as unknown as { from: number; to: number; slice: { content: { size: number; textBetween: (a: number, b: number, sep: string) => string } } };
    if (step instanceof ReplaceStep && to > from) {
      // The document as it was just before this step.
      const before = tr.docs[i];
      removed += to - from;
      removedText += before.textBetween(from, to, '\n');
    }
    inserted += slice.content.textBetween(0, slice.content.size, '\n');
  });
  return { inserted, removed, removedText };
}

// Track which round docs are open, to log time spent in other apps or tabs.
const openRound = new Map<string, { count: number; ydoc: Y.Doc | null }>();
let listening = false;
function listenAway() {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  const log = (k: 'away' | 'back') => {
    for (const [docId, o] of openRound) if (isRound(o.ydoc)) logEvent(docId, { k });
  };
  window.addEventListener('blur', () => log('away'));
  window.addEventListener('focus', () => log('back'));
}

export const RoundGuard = Extension.create<{ ydoc: Y.Doc | null; docId: string | null }>({
  name: 'roundGuard',
  addOptions() {
    return { ydoc: null, docId: null };
  },
  addProseMirrorPlugins() {
    const { ydoc, docId } = this.options;
    const round = () => isRound(ydoc);
    return [
      new Plugin({
        key: new PluginKey('pp-round-guard'),
        state: {
          init: () => null,
          apply(tr) {
            if (!docId || !tr.docChanged || !round()) return null;
            if (tr.getMeta(ySyncPluginKey)?.isChangeOrigin) return null;
            const { inserted, removed, removedText } = editsOf(tr);
            if (removed) logEvent(docId, { k: 'delete', n: removedText.length || removed, s: removedText.slice(0, 500) });
            if (inserted) {
              if (inserted.length > LARGE_INSERT) logEvent(docId, { k: 'large', n: inserted.length, s: inserted.slice(0, 200) });
              else logEvent(docId, { k: 'type', s: inserted });
            }
            return null;
          },
        },
        view() {
          if (docId) {
            listenAway();
            openRound.set(docId, { count: (openRound.get(docId)?.count ?? 0) + 1, ydoc });
          }
          return {
            destroy() {
              if (!docId) return;
              const o = openRound.get(docId);
              if (!o || o.count <= 1) openRound.delete(docId);
              else openRound.set(docId, { ...o, count: o.count - 1 });
            },
          };
        },
        props: {
          handlePaste(_view, _event, slice) {
            if (!round() || !docId) return false;
            logEvent(docId, { k: 'paste-blocked', n: slice.content.size });
            toast('Paste is off in round docs. Type it in.');
            return true;
          },
          handleDrop(_view, _event, slice) {
            if (!round() || !docId) return false;
            logEvent(docId, { k: 'drop-blocked', n: slice.content.size });
            toast('Drag and drop is off in round docs.');
            return true;
          },
        },
      }),
    ];
  },
});
