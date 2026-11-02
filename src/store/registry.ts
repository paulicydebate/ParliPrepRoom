import { IndexeddbPersistence } from 'y-indexeddb';
import * as Y from 'yjs';
import { saveVersion } from './versions';

// Open documents, shared between panes. Two panes showing the same document
// use the same Y.Doc, so they stay in sync the same way partners will.

const AUTO_VERSION_MS = 2 * 60 * 1000;

interface Entry {
  doc: Y.Doc;
  persistence: IndexeddbPersistence;
  ready: Promise<void>;
  refs: number;
  dirty: boolean;
  timer: ReturnType<typeof setInterval>;
  closeTimer: ReturnType<typeof setTimeout> | null;
}

const open = new Map<string, Entry>();

export function ydbName(docId: string) {
  return `pp-doc-${docId}`;
}

async function autoVersion(docId: string, entry: Entry) {
  if (!entry.dirty) return;
  entry.dirty = false;
  await saveVersion(docId, entry.doc, { auto: true });
}

export function acquireDoc(docId: string): { doc: Y.Doc; ready: Promise<void> } {
  let entry = open.get(docId);
  if (!entry) {
    const doc = new Y.Doc();
    const persistence = new IndexeddbPersistence(ydbName(docId), doc);
    const ready = persistence.whenSynced.then(() => undefined);
    const created: Entry = {
      doc,
      persistence,
      ready,
      refs: 0,
      dirty: false,
      timer: setInterval(() => void autoVersion(docId, created), AUTO_VERSION_MS),
      closeTimer: null,
    };
    doc.on('update', (_u: Uint8Array, origin: unknown) => {
      if (origin !== persistence) created.dirty = true;
    });
    // A baseline version each session (skipped if nothing changed since the last one).
    void ready.then(() => saveVersion(docId, doc, { auto: true }));
    entry = created;
    open.set(docId, entry);
  }
  if (entry.closeTimer) {
    clearTimeout(entry.closeTimer);
    entry.closeTimer = null;
  }
  entry.refs++;
  return { doc: entry.doc, ready: entry.ready };
}

export function releaseDoc(docId: string) {
  const entry = open.get(docId);
  if (!entry) return;
  entry.refs--;
  if (entry.refs > 0) return;
  // Wait a moment: React may remount the same pane right away.
  entry.closeTimer = setTimeout(async () => {
    if (entry.refs > 0) return;
    open.delete(docId);
    clearInterval(entry.timer);
    await autoVersion(docId, entry);
    await entry.persistence.destroy();
    entry.doc.destroy();
  }, 1500);
}

/** Save an auto version of every open document (used when the tab is hidden). */
export async function flushAutoVersions() {
  await Promise.all([...open.entries()].map(([id, e]) => autoVersion(id, e)));
}

export async function destroyDocData(docId: string) {
  const entry = open.get(docId);
  if (entry) {
    open.delete(docId);
    clearInterval(entry.timer);
    await entry.persistence.destroy();
    entry.doc.destroy();
  }
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(ydbName(docId));
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
}
