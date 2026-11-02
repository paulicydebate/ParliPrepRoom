import { createStore, get, set } from 'idb-keyval';
import { getProfile } from '../settings/profile';
import { createSignal } from './emitter';
const store = createStore('pp-typing-log', 'log');
export const logChanged = createSignal();
const GENESIS = '0'.repeat(64);
const pending = new Map();
/** Sends saved events on to the server's record (set by the app when signed in). */
let uploader = null;
export function setLogUploader(fn) {
    uploader = fn;
}
const writing = new Map();
let timer = null;
async function sha256(text) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
const batchPayload = (b) => JSON.stringify([b.seq, b.at, b.prev, b.events]);
/** Queue an event; batches are written about once a second. */
export function logEvent(docId, e) {
    const list = pending.get(docId) ?? [];
    const who = getProfile();
    list.push({ t: Date.now(), a: who.name || 'Unnamed', d: who.deviceId, ...e });
    pending.set(docId, list);
    if (!timer)
        timer = setTimeout(() => void flushLog(), 1000);
}
async function writeBatch(docId, events) {
    const head = (await get(`head:${docId}`, store)) ?? { seq: 0, hash: GENESIS };
    const draft = { seq: head.seq + 1, at: Date.now(), events, prev: head.hash };
    const batch = { ...draft, hash: await sha256(batchPayload(draft)) };
    await set(`batch:${docId}:${batch.seq}`, batch, store);
    await set(`head:${docId}`, { seq: batch.seq, hash: batch.hash }, store);
}
export async function flushLog() {
    timer = null;
    const jobs = [];
    for (const [docId, events] of pending) {
        pending.delete(docId);
        if (!events.length)
            continue;
        const prev = writing.get(docId) ?? Promise.resolve();
        const job = prev.then(async () => {
            await writeBatch(docId, events);
            if (uploader)
                void uploader(docId, events).catch(() => { });
        });
        writing.set(docId, job.catch(() => { }));
        jobs.push(job);
    }
    await Promise.all(jobs);
    if (jobs.length)
        logChanged.emit();
}
export async function readLog(docId) {
    await flushLog();
    const head = (await get(`head:${docId}`, store));
    const batches = [];
    let intact = true;
    let prev = GENESIS;
    for (let seq = 1; head && seq <= head.seq; seq++) {
        const b = (await get(`batch:${docId}:${seq}`, store));
        if (!b) {
            intact = false;
            continue;
        }
        const { hash, ...rest } = b;
        if (b.prev !== prev || (await sha256(batchPayload(rest))) !== hash)
            intact = false;
        prev = hash;
        batches.push(b);
    }
    if (head && head.hash !== prev)
        intact = false;
    return {
        batches,
        events: batches.flatMap((b) => b.events),
        intact,
        seal: head ? `${head.hash.slice(0, 4)}-${head.hash.slice(4, 8)}`.toUpperCase() : null,
    };
}
export function summarizeLog(events) {
    let typed = 0;
    let deleted = 0;
    let blocked = 0;
    let large = 0;
    let awayMs = 0;
    let awaySince = null;
    for (const e of events) {
        if (e.k === 'type')
            typed += e.s?.length ?? e.n ?? 0;
        else if (e.k === 'delete')
            deleted += e.n ?? 0;
        else if (e.k === 'paste-blocked' || e.k === 'drop-blocked')
            blocked++;
        else if (e.k === 'large')
            large++;
        else if (e.k === 'away')
            awaySince = e.t;
        else if (e.k === 'back' && awaySince !== null) {
            awayMs += e.t - awaySince;
            awaySince = null;
        }
    }
    const byAuthor = new Map();
    for (const e of events) {
        if (e.k !== 'type' && e.k !== 'delete' && e.k !== 'large')
            continue;
        const key = e.a ?? 'Unnamed';
        const a = byAuthor.get(key) ?? { typed: 0, deleted: 0 };
        if (e.k === 'delete')
            a.deleted += e.n ?? 0;
        else
            a.typed += e.s?.length ?? e.n ?? 0;
        byAuthor.set(key, a);
    }
    const first = events[0]?.t ?? null;
    const last = events[events.length - 1]?.t ?? null;
    return { typed, deleted, blocked, large, awayMs, first, last, byAuthor };
}
/** Group typing and deleting into readable bursts for the full record. */
export function burstsOf(events, gapMs = 4000) {
    const out = [];
    let cur = null;
    for (const e of events) {
        if (e.k !== 'type' && e.k !== 'delete' && e.k !== 'large') {
            cur = null;
            continue;
        }
        const author = e.a ?? 'Unnamed';
        if (!cur || cur.author !== author || cur.device !== e.d || e.t - cur.end > gapMs) {
            cur = { start: e.t, end: e.t, author, device: e.d, parts: [] };
            out.push(cur);
        }
        cur.end = e.t;
        const kind = e.k === 'type' ? 'typed' : e.k === 'delete' ? 'removed' : 'large';
        const text = e.s ?? (e.k === 'delete' ? `[${e.n ?? 0} characters]` : '');
        const last = cur.parts[cur.parts.length - 1];
        if (last && last.kind === kind && kind !== 'large')
            last.text = kind === 'removed' ? text + last.text : last.text + text;
        else
            cur.parts.push({ kind, text });
    }
    return out;
}
