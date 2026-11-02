import { createStore, del, get, set } from 'idb-keyval';
import { PERSONAL, createServerDoc, deleteServerDoc, getAccount, listServerDocs, patchServerDoc, syncing, } from './account';
import { createSignal } from './emitter';
const store = createStore('pp-meta', 'meta');
const KEY = 'docs';
export const docsChanged = createSignal();
let cache = null;
export async function listDocs() {
    if (!cache)
        cache = (await get(KEY, store)) ?? [];
    return cache;
}
/** Which sidebar list a doc appears in. */
export function spaceOf(d) {
    return d.teamId ?? PERSONAL;
}
export const onServer = (d) => !!d && d.teamId !== undefined;
/** Docs in sidebar order: by `order`, then newest first for docs never moved. */
export function sortDocs(docs) {
    const key = (d) => d.order ?? -d.createdAt;
    return [...docs].sort((a, b) => key(a) - key(b) || b.createdAt - a.createdAt);
}
async function save(docs) {
    cache = docs;
    await set(KEY, docs, store);
    docsChanged.emit();
}
async function update(id, patch) {
    await save((await listDocs()).map((d) => (d.id === id ? { ...d, ...patch } : d)));
}
/** Tell the server about a change; failures are reported but don't undo the local change. */
function push(id, patch) {
    void (async () => {
        const meta = (await listDocs()).find((d) => d.id === id);
        if (!syncing() || !onServer(meta))
            return;
        try {
            const fresh = await patchServerDoc(id, patch);
            await update(id, fromServer(fresh));
        }
        catch (e) {
            console.warn('Could not update the doc on the server', e);
        }
    })();
}
function fromServer(s) {
    return {
        title: s.title,
        kind: s.kind,
        round: s.round,
        order: s.order ?? undefined,
        teamId: s.teamId,
        ownerId: s.ownerId,
        partners: s.partners,
        checkToken: s.checkToken,
        tournamentName: s.tournamentName ?? null,
        roundLabel: s.roundLabel ?? null,
    };
}
/**
 * Drag-and-drop in the sidebar: put `id` in section `kind`, just before
 * `beforeId` (or at the end). Moving between sections changes the doc's type.
 */
export async function moveDoc(id, kind, beforeId) {
    const docs = await listDocs();
    const moving = docs.find((d) => d.id === id);
    if (!moving || id === beforeId)
        return;
    const space = spaceOf(moving);
    const section = sortDocs(docs.filter((d) => d.kind === kind && d.id !== id && spaceOf(d) === space));
    const at = beforeId ? section.findIndex((d) => d.id === beforeId) : -1;
    section.splice(at < 0 ? section.length : at, 0, { ...moving, kind });
    const orders = new Map(section.map((d, i) => [d.id, i]));
    await save(docs.map((d) => (orders.has(d.id) ? { ...d, kind: d.id === id ? kind : d.kind, order: orders.get(d.id) } : d)));
    for (const [docId, order] of orders) {
        const before = docs.find((d) => d.id === docId);
        if (before && (before.order !== order || (docId === id && before.kind !== kind)))
            push(docId, { order, ...(docId === id ? { kind } : {}) });
    }
}
export function newDocId() {
    return crypto.randomUUID();
}
/**
 * Create a doc in the current space. When signed in it's registered on the
 * server first, so it syncs from the first keystroke.
 */
export async function createDoc(input) {
    const docs = await listDocs();
    const space = input.space ?? getAccount().space;
    // New docs go to the top of their section. A section that was never
    // reordered sorts newest first, so the new doc needs no number there.
    const ordered = docs.filter((d) => d.kind === input.kind && d.order !== undefined && spaceOf(d) === space).map((d) => d.order);
    const order = ordered.length ? Math.min(...ordered) - 1 : undefined;
    let meta = { id: input.id ?? newDocId(), title: input.title, kind: input.kind, createdAt: Date.now(), order };
    if (syncing()) {
        const teamId = space === PERSONAL ? null : space;
        const s = await createServerDoc({ id: meta.id, teamId, title: meta.title, kind: meta.kind, order: order ?? null });
        meta = { ...meta, ...fromServer(s), order: s.order ?? order };
    }
    await save([...docs, meta]);
    return meta;
}
export async function renameDoc(id, title) {
    const d = (await listDocs()).find((x) => x.id === id);
    if (!d || d.title === title)
        return;
    await update(id, { title });
    push(id, { title });
}
export async function setDocRound(id, round) {
    const d = (await listDocs()).find((x) => x.id === id);
    if (!d || !!d.round === round)
        return;
    await update(id, { round });
    push(id, { round });
}
export async function setDocPartners(id, partners) {
    await update(id, { partners });
    push(id, { partners });
}
/** Move one of my docs into a team (or back to my own docs). */
export async function setDocTeam(id, teamId) {
    await update(id, { teamId });
    push(id, { teamId });
}
/** Remove a doc from this device and, if allowed, from the server. Throws if the server refuses. */
export async function deleteDoc(id) {
    const d = (await listDocs()).find((x) => x.id === id);
    if (syncing() && onServer(d))
        await deleteServerDoc(id);
    await save((await listDocs()).filter((x) => x.id !== id));
    await del(`seeded:${id}`, store).catch(() => { });
}
/**
 * "New round": a round doc made in one step, already shared with the partner
 * and tagged with the tournament and round. Needs sign-in.
 */
export async function createRoundDoc(input) {
    const docs = await listDocs();
    const id = newDocId();
    const s = await createServerDoc({
        id,
        teamId: input.space === PERSONAL ? null : input.space,
        title: input.title,
        kind: 'prep',
        round: true,
        partners: input.partners,
        tournamentCode: input.tournamentCode,
        roundLabel: input.roundLabel,
    });
    const meta = { id, createdAt: s.createdAt, ...fromServer(s) };
    await save([...docs, meta]);
    return meta;
}
/** Make sure a doc that so far lived only on this device is on the server (as one of my own docs). */
export async function ensureOnServer(id) {
    const d = (await listDocs()).find((x) => x.id === id);
    if (!d || !syncing())
        return false;
    if (onServer(d))
        return true;
    try {
        const s = await createServerDoc({ id, teamId: null, title: d.title, kind: d.kind, round: d.round, order: d.order ?? null });
        await update(id, fromServer(s));
        return true;
    }
    catch {
        return false;
    }
}
/** First sign-in on a device: put its docs on the server, under "My docs". */
export async function uploadLocalDocs() {
    for (const d of await listDocs())
        if (!onServer(d))
            await ensureOnServer(d.id);
}
/** Bring the sidebar list for a space up to date with the server. */
export async function syncDocList(space) {
    if (!syncing())
        return;
    const remote = await listServerDocs(space);
    const docs = await listDocs();
    const byId = new Map(docs.map((d) => [d.id, d]));
    const remoteIds = new Set(remote.map((r) => r.id));
    const next = [];
    for (const d of docs) {
        // Drop docs this list used to have that the server no longer shows us
        // (deleted, moved to a team we're not on, or no longer shared with us).
        if (onServer(d) && spaceOf(d) === space && !remoteIds.has(d.id))
            continue;
        const r = remote.find((x) => x.id === d.id);
        next.push(r ? { ...d, ...fromServer(r) } : d);
    }
    for (const r of remote)
        if (!byId.has(r.id))
            next.push({ id: r.id, createdAt: r.createdAt, ...fromServer(r) });
    await save(next);
}
/** Add a doc someone shared by link (after checking we have access). */
export async function addSharedDoc(id) {
    const existing = (await listDocs()).find((d) => d.id === id);
    if (existing)
        return existing;
    if (!syncing())
        return null;
    const { getServerDoc } = await import('./account');
    try {
        const s = await getServerDoc(id);
        const meta = { id, createdAt: s.createdAt, ...fromServer(s) };
        await save([...(await listDocs()), meta]);
        return meta;
    }
    catch {
        return null;
    }
}
/** For tests. */
export function resetDocsCache() {
    cache = null;
}
