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
  /** Round doc: paste blocked, typing logged (mirrors the flag inside the doc, for the sidebar). */
  round?: boolean;
  /** Position in the sidebar list (lower first). */
  order?: number;
}

const store = createStore('pp-meta', 'meta');
const KEY = 'docs';
export const docsChanged = createSignal();

let cache: DocMeta[] | null = null;

export async function listDocs(): Promise<DocMeta[]> {
  if (!cache) cache = ((await get(KEY, store)) as DocMeta[] | undefined) ?? [];
  return cache;
}

/** Docs in sidebar order: by `order`, then newest first for docs never moved. */
export function sortDocs(docs: DocMeta[]): DocMeta[] {
  const key = (d: DocMeta) => d.order ?? -d.createdAt;
  return [...docs].sort((a, b) => key(a) - key(b) || b.createdAt - a.createdAt);
}

/**
 * Drag-and-drop in the sidebar: put `id` in section `kind`, just before
 * `beforeId` (or at the end). Moving between sections changes the doc's type.
 */
export async function moveDoc(id: string, kind: DocKind, beforeId: string | null) {
  const docs = await listDocs();
  const moving = docs.find((d) => d.id === id);
  if (!moving || id === beforeId) return;
  const section = sortDocs(docs.filter((d) => d.kind === kind && d.id !== id));
  const at = beforeId ? section.findIndex((d) => d.id === beforeId) : -1;
  section.splice(at < 0 ? section.length : at, 0, { ...moving, kind });
  const orders = new Map(section.map((d, i) => [d.id, i]));
  await save(docs.map((d) => (orders.has(d.id) ? { ...d, kind: d.id === id ? kind : d.kind, order: orders.get(d.id) } : d)));
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
  const docs = await listDocs();
  // New docs go to the top of their section. A section that was never
  // reordered sorts newest first, so the new doc needs no number there.
  const ordered = docs.filter((d) => d.kind === input.kind && d.order !== undefined).map((d) => d.order!);
  const order = ordered.length ? Math.min(...ordered) - 1 : undefined;
  const meta: DocMeta = { id: input.id ?? newDocId(), title: input.title, kind: input.kind, createdAt: Date.now(), order };
  await save([...docs, meta]);
  return meta;
}

export async function renameDoc(id: string, title: string) {
  await save((await listDocs()).map((d) => (d.id === id ? { ...d, title } : d)));
}

export async function setDocRound(id: string, round: boolean) {
  const docs = await listDocs();
  if (docs.find((d) => d.id === id)?.round === round) return;
  await save(docs.map((d) => (d.id === id ? { ...d, round } : d)));
}

export async function deleteDoc(id: string) {
  await save((await listDocs()).filter((d) => d.id !== id));
  await del(`seeded:${id}`, store).catch(() => {});
}

/** For tests. */
export function resetDocsCache() {
  cache = null;
}
