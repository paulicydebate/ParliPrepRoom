import { createStore, del, get, set } from 'idb-keyval';
import * as Y from 'yjs';
import { createSignal } from './emitter';
const store = createStore('pp-versions', 'versions');
export const versionsChanged = createSignal();
const listKey = (docId) => `list:${docId}`;
const dataKey = (id) => `data:${id}`;
// Serialize writes per document so concurrent saves don't drop list entries.
const queues = new Map();
function enqueue(docId, job) {
    const prev = queues.get(docId) ?? Promise.resolve();
    const next = prev.then(job, job);
    queues.set(docId, next.catch(() => { }));
    return next;
}
function sameBytes(a, b) {
    if (a.length !== b.length)
        return false;
    for (let i = 0; i < a.length; i++)
        if (a[i] !== b[i])
            return false;
    return true;
}
/** Newest first. */
export async function listVersions(docId) {
    const list = (await get(listKey(docId), store)) ?? [];
    return [...list].sort((a, b) => b.at - a.at);
}
/**
 * Save the document's current state as a version. Auto-saves are skipped
 * when nothing changed since the newest version, and when the document is empty.
 */
export function saveVersion(docId, doc, opts) {
    return enqueue(docId, async () => {
        const list = (await get(listKey(docId), store)) ?? [];
        const sv = Y.encodeStateVector(doc);
        if (opts.auto) {
            if (doc.store.clients.size === 0)
                return null;
            const newest = list.reduce((a, v) => (!a || v.at > a.at ? v : a), null);
            if (newest && sameBytes(newest.sv, sv))
                return null;
        }
        const meta = {
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
export function renameVersion(docId, id, name) {
    return enqueue(docId, async () => {
        const list = (await get(listKey(docId), store)) ?? [];
        const trimmed = name.trim() || null;
        await set(listKey(docId), list.map((v) => (v.id === id ? { ...v, name: trimmed, auto: trimmed ? false : v.auto } : v)), store);
        versionsChanged.emit();
    });
}
/** Load a version into its own detached Y.Doc. */
export async function loadVersionDoc(id) {
    const data = (await get(dataKey(id), store));
    if (!data)
        return null;
    const doc = new Y.Doc();
    Y.applyUpdate(doc, data);
    return doc;
}
export function deleteAllVersions(docId) {
    return enqueue(docId, async () => {
        const list = (await get(listKey(docId), store)) ?? [];
        for (const v of list)
            await del(dataKey(v.id), store);
        await del(listKey(docId), store);
        versionsChanged.emit();
    });
}
