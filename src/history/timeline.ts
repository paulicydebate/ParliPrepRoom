import type { JSONContent } from '@tiptap/core';
import { yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import * as Y from 'yjs';
import { measureUpdate } from '../../worker/measure';
import { BODY_FIELD } from '../editor/extensions';
import { readFlow, type FlowSheetData } from '../flow2/model';
import type { LogUpdate } from '../store/account';

// Version history and replay built from the server's record: every saved edit,
// with who made it and when. Pure data work, no UI.

export interface DecodedUpdate extends Omit<LogUpdate, 'data'> {
  bytes: Uint8Array;
  inserted: number;
  deleted: number;
  text: string;
  deletedText: string;
}

/** A run of edits by one person with no pause longer than GAP_MS. */
export interface EditSession {
  index: number;
  userId: string;
  name: string;
  start: number;
  end: number;
  /** Positions in the updates list (inclusive). */
  from: number;
  to: number;
  inserted: number;
  deleted: number;
  /** Synced after being offline / first upload, rather than typed live. */
  catchup: boolean;
}

export const GAP_MS = 2 * 60_000;

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function decodeLog(log: LogUpdate[]): DecodedUpdate[] {
  const chars = new Map<string, string>();
  return log.map((u) => {
    const bytes = fromBase64(u.data);
    const m = measureUpdate(bytes, chars);
    return { seq: u.seq, at: u.at, userId: u.userId, name: u.name, via: u.via, bytes, inserted: m.text.length, deleted: m.deletedText.length || m.deleted, text: m.text, deletedText: m.deletedText };
  });
}

export function sessionsOf(updates: DecodedUpdate[]): EditSession[] {
  const out: EditSession[] = [];
  updates.forEach((u, i) => {
    const catchup = u.via !== 'live';
    const last = out[out.length - 1];
    if (last && last.userId === u.userId && last.catchup === catchup && u.at - last.end < GAP_MS) {
      last.end = u.at;
      last.to = i;
      last.inserted += u.inserted;
      last.deleted += u.deleted;
    } else {
      out.push({ index: out.length, userId: u.userId, name: u.name, start: u.at, end: u.at, from: i, to: i, inserted: u.inserted, deleted: u.deleted, catchup });
    }
  });
  return out;
}

/**
 * Rebuilds the doc as of any update. Keeps a saved copy every SNAP updates so
 * scrubbing back and forth stays quick.
 */
export class DocReplayer {
  private snaps: { at: number; state: Uint8Array }[] = [];
  private static SNAP = 40;

  constructor(private updates: DecodedUpdate[]) {
    const doc = new Y.Doc();
    this.snaps.push({ at: -1, state: Y.encodeStateAsUpdate(doc) });
    updates.forEach((u, i) => {
      Y.applyUpdate(doc, u.bytes);
      if ((i + 1) % DocReplayer.SNAP === 0) this.snaps.push({ at: i, state: Y.encodeStateAsUpdate(doc) });
    });
    doc.destroy();
  }

  /** The whole Yjs document after update number `i` (-1 = empty). The caller destroys it. */
  docAt(i: number): Y.Doc {
    let snap = this.snaps[0];
    for (const s of this.snaps) if (s.at <= i) snap = s;
    const doc = new Y.Doc();
    Y.applyUpdate(doc, snap.state);
    for (let k = snap.at + 1; k <= i && k < this.updates.length; k++) Y.applyUpdate(doc, this.updates[k].bytes);
    return doc;
  }

  /** A flow as it was after update number `i`. */
  flowAt(i: number): FlowSheetData[] {
    const doc = this.docAt(i);
    const sheets = readFlow(doc);
    doc.destroy();
    return sheets;
  }

  /** The document (ProseMirror JSON) after update number `i` (-1 = empty). */
  jsonAt(i: number): JSONContent {
    const doc = this.docAt(i);
    const json = yXmlFragmentToProsemirrorJSON(doc.getXmlFragment(BODY_FIELD)) as JSONContent;
    doc.destroy();
    return json;
  }
}
