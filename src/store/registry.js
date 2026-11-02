import { IndexeddbPersistence } from 'y-indexeddb';
import * as Y from 'yjs';
import { loadAccount, syncing } from './account';
import { ensureOnServer } from './docs';
import { connect } from './sync';
import { saveVersion } from './versions';
// Open documents, shared between panes. Two panes showing the same document
// use the same Y.Doc, so they stay in sync the same way partners will.
const AUTO_VERSION_MS = 2 * 60 * 1000;
const open = new Map();
export function ydbName(docId) {
    return `pp-doc-${docId}`;
}
async function autoVersion(docId, entry) {
    if (!entry.dirty)
        return;
    entry.dirty = false;
    await saveVersion(docId, entry.doc, { auto: true });
}
export function acquireDoc(docId) {
    let entry = open.get(docId);
    if (!entry) {
        const doc = new Y.Doc();
        const persistence = new IndexeddbPersistence(ydbName(docId), doc);
        // Ready once the local copy is loaded and, if the server is there, the
        // connection is set up (the editor needs it for live cursors).
        const ready = persistence.whenSynced.then(async () => {
            await loadAccount();
            if (syncing() && (await ensureOnServer(docId)) && !doc.isDestroyed)
                created.provider = connect(docId, doc);
        });
        const created = {
            doc,
            persistence,
            provider: null,
            ready,
            refs: 0,
            dirty: false,
            timer: setInterval(() => void autoVersion(docId, created), AUTO_VERSION_MS),
            closeTimer: null,
        };
        doc.on('update', (_u, origin) => {
            if (origin !== persistence)
                created.dirty = true;
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
    const e = entry;
    return { doc: entry.doc, ready: entry.ready, provider: () => e.provider };
}
export function releaseDoc(docId) {
    const entry = open.get(docId);
    if (!entry)
        return;
    entry.refs--;
    if (entry.refs > 0)
        return;
    // Wait a moment: React may remount the same pane right away.
    entry.closeTimer = setTimeout(async () => {
        if (entry.refs > 0)
            return;
        open.delete(docId);
        clearInterval(entry.timer);
        await autoVersion(docId, entry);
        entry.provider?.destroy();
        await entry.persistence.destroy();
        entry.doc.destroy();
    }, 1500);
}
/** Save an auto version of every open document (used when the tab is hidden). */
export async function flushAutoVersions() {
    await Promise.all([...open.entries()].map(([id, e]) => autoVersion(id, e)));
}
export async function destroyDocData(docId) {
    const entry = open.get(docId);
    if (entry) {
        open.delete(docId);
        clearInterval(entry.timer);
        entry.provider?.destroy();
        await entry.persistence.destroy();
        entry.doc.destroy();
    }
    await new Promise((resolve) => {
        const req = indexedDB.deleteDatabase(ydbName(docId));
        req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
}
