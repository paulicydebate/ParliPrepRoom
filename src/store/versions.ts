import { del, get, set } from 'idb-keyval';
import { createStore } from './idb';
import * as Y from 'yjs';
import { createSignal } from './emitter';

// Revision history. Each version is a full copy of the document's Yjs state,
// so any version can be opened, compared or restored on its own.

export interface VersionMeta {
  id: string;
  docId: string;
  at: number;
  /** User-given name; null for auto-saves. */
  name: string | null;
  auto: boolean;
  /** Yjs state vector; equal vectors mean identical content. */
  sv: Uint8Array;
}

const store = createStore('pp-versions', 'versions');
export const versionsChanged = createSignal();

const listKey = (docId: string) => `list:${docId}`;
const dataKey = (id: string) => `data:${id}`;

// Serialize writes per document so concurrent saves don't drop list entries.
const queues = new Map<string, Promise<unknown>>();
function enqueue<T>(docId: string, job: () => Promise<T>): Promise<T> {
  const prev = queues.get(docId) ?? Promise.resolve();
  const next = prev.then(job, job);
  queues.set(docId, next.catch(() => {}));
  return next;
}

function sameBytes(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Newest first. */
export async function listVersions(docId: string): Promise<VersionMeta[]> {
  const list = ((await get(listKey(docId), store)) as VersionMeta[] | undefined) ?? [];
  return [...list].sort((a, b) => b.at - a.at);
}

/**
 * Save the document's current state as a version. Auto-saves are skipped
 * when nothing changed since the newest version, and when the document is empty.
 */
export function saveVersion(
  docId: string,
  doc: Y.Doc,
  opts: { name?: string | null; auto: boolean },
): Promise<VersionMeta | null> {
  return enqueue(docId, async () => {
    const list = ((await get(listKey(docId), store)) as VersionMeta[] | undefined) ?? [];
    const sv = Y.encodeStateVector(doc);
    if (opts.auto) {
      if (doc.store.clients.size === 0) return null;
      const newest = list.reduce<VersionMeta | null>((a, v) => (!a || v.at > a.at ? v : a), null);
      if (newest && sameBytes(newest.sv, sv)) return null;
    }
    const meta: VersionMeta = {
      id: crypto.randomUUID(),
      docId,
      at: Date.now(),
      name: opts.name?.trim() || null,
      auto: opts.auto,
      sv,
    };
    await set(dataKey(meta.id), Y.encodeStateAsUpdate(doc), store);
    await set(listKey(docId), [...list, meta], store);
    versionsChanged.emit();
    return meta;
  });
}

export function renameVersion(docId: string, id: string, name: string) {
  return enqueue(docId, async () => {
    const list = ((await get(listKey(docId), store)) as VersionMeta[] | undefined) ?? [];
    const trimmed = name.trim() || null;
    await set(
      listKey(docId),
      list.map((v) => (v.id === id ? { ...v, name: trimmed, auto: trimmed ? false : v.auto } : v)),
      store,
    );
    versionsChanged.emit();
  });
}

/** Load a version into its own detached Y.Doc. */
export async function loadVersionDoc(id: string): Promise<Y.Doc | null> {
  const data = (await get(dataKey(id), store)) as Uint8Array | undefined;
  if (!data) return null;
  const doc = new Y.Doc();
  Y.applyUpdate(doc, data);
  return doc;
}

export function deleteAllVersions(docId: string) {
  return enqueue(docId, async () => {
    const list = ((await get(listKey(docId), store)) as VersionMeta[] | undefined) ?? [];
    for (const v of list) await del(dataKey(v.id), store);
    await del(listKey(docId), store);
    versionsChanged.emit();
  });
}
