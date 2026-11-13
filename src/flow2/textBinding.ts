import * as Y from 'yjs';
import { ORIGIN_LOCAL } from './model';

// Keeps a <textarea> and a Y.Text in step: typing becomes small inserts and deletes (so two people
// typing in one cell merge by character), and changes from other people or from undo update the
// textarea without losing the caret.

/** The smallest edit that turns `a` into `b`: delete `del` characters at `at`, then insert `ins`. */
export function diffText(a: string, b: string): { at: number; del: number; ins: string } {
  let start = 0;
  const max = Math.min(a.length, b.length);
  while (start < max && a.charCodeAt(start) === b.charCodeAt(start)) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a.charCodeAt(endA - 1) === b.charCodeAt(endB - 1)) {
    endA--;
    endB--;
  }
  // Never cut an emoji (or any character stored as a pair) in half: Yjs would save the halves as broken characters.
  const high = (s: string, i: number) => (s.charCodeAt(i) & 0xfc00) === 0xd800;
  const low = (s: string, i: number) => (s.charCodeAt(i) & 0xfc00) === 0xdc00;
  if (start > 0 && high(a, start - 1)) start--;
  if (endA < a.length && low(a, endA)) {
    endA++;
    endB++;
  }
  return { at: start, del: endA - start, ins: b.slice(start, endB) };
}

type Delta = { retain?: number; insert?: unknown; delete?: number }[];

/** Where a caret at `pos` ends up after a change (positions in `delta` are in the old text). */
export function mapPosition(delta: Delta, pos: number): number {
  let at = 0; // position in the old text
  let out = pos;
  for (const op of delta) {
    if (op.retain !== undefined) at += op.retain;
    else if (typeof op.insert === 'string') {
      if (at < pos) out += op.insert.length;
    } else if (op.delete !== undefined) {
      out -= Math.min(op.delete, Math.max(0, pos - at));
      at += op.delete;
    }
  }
  return Math.max(0, out);
}

/** What a person just did to a cell's text: where, how much they removed (and which text), and what they put in. */
export interface LocalEdit {
  at: number;
  del: number;
  deleted: string;
  ins: string;
}

export function bindText(el: HTMLTextAreaElement, text: Y.Text, onLocal?: (e: LocalEdit) => void): () => void {
  const doc = text.doc;
  let composing = false;
  el.value = text.toString();

  const fromY = (event: Y.YTextEvent, tr: Y.Transaction) => {
    if (tr.origin === el) return;
    const delta = event.delta as Delta;
    const focused = document.activeElement === el;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    el.value = text.toString();
    if (focused) el.setSelectionRange(mapPosition(delta, start), mapPosition(delta, end));
    el.dispatchEvent(new Event('flow2-remote'));
  };
  text.observe(fromY);

  const toY = () => {
    if (composing || !doc) return;
    const d = diffText(text.toString(), el.value);
    if (!d.del && !d.ins) return;
    onLocal?.({ ...d, deleted: text.toString().slice(d.at, d.at + d.del) });
    doc.transact(() => {
      if (d.del) text.delete(d.at, d.del);
      if (d.ins) text.insert(d.at, d.ins);
    }, ORIGIN_LOCAL_EL(el));
  };
  const start = () => (composing = true);
  const stop = () => {
    composing = false;
    toY();
  };
  el.addEventListener('input', toY);
  el.addEventListener('compositionstart', start);
  el.addEventListener('compositionend', stop);
  return () => {
    text.unobserve(fromY);
    el.removeEventListener('input', toY);
    el.removeEventListener('compositionstart', start);
    el.removeEventListener('compositionend', stop);
  };
}

// Edits from a textarea are tagged with the textarea itself (so it ignores its own echo) but must
// still count as local for undo; the undo manager tracks both through this marker.
export const textOrigins = new WeakSet<object>();
function ORIGIN_LOCAL_EL(el: HTMLTextAreaElement) {
  textOrigins.add(el);
  return el;
}
export { ORIGIN_LOCAL };
