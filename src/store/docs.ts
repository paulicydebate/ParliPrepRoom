import { createStore, del, get, set } from 'idb-keyval';
import { createSignal } from './emitter';

// Document list. Each document's body lives in its own Yjs IndexedDB
// database (see registry.ts); this store only keeps titles and types.

export type DocKind = 'prep' | 'reference';

export interface DocMeta {
  id: string;
  title: string;
  kind: DocKind;
  createdAt: number;
}

const store = createStore('pp-meta', 'meta');
const KEY = 'docs';
export const docsChanged = createSignal();

let cache: DocMeta[] | null = null;

export async function listDocs(): Promise<DocMeta[]> {
  if (!cache) cache = ((await get(KEY, store)) as DocMeta[] | undefined) ?? [];
  return cache;
}

async function save(docs: DocMeta[]) {
  cache = docs;
  await set(KEY, docs, store);
  docsChanged.emit();
}

export function newDocId(): string {
  return crypto.randomUUID();
}

export async function createDoc(input: { title: string; kind: DocKind; id?: string }): Promise<DocMeta> {
  const meta: DocMeta = { id: input.id ?? newDocId(), title: input.title, kind: input.kind, createdAt: Date.now() };
  await save([...(await listDocs()), meta]);
  return meta;
}

export async function renameDoc(id: string, title: string) {
  await save((await listDocs()).map((d) => (d.id === id ? { ...d, title } : d)));
}

export async function deleteDoc(id: string) {
  await save((await listDocs()).filter((d) => d.id !== id));
  await del(`seeded:${id}`, store).catch(() => {});
}

/** For tests. */
export function resetDocsCache() {
  cache = null;
}
