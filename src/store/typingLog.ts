import { createStore, get, set } from 'idb-keyval';
import { getProfile } from '../settings/profile';
import { createSignal } from './emitter';

// Typing log for round docs: every local edit, blocked paste and round-doc
// switch, with timestamps. Events are saved in batches; each batch carries the
// SHA-256 of the previous one (a hash chain), so editing or removing an old
// batch afterwards breaks the chain and changes the seal code.
//
// Limit: this proves what happened inside the app on this device. A server
// stamp on the chain (Phase 4) is what stops a student rewriting it locally.

export type LogKind =
  | 'type' // text inserted by typing (s = text)
  | 'delete' // n = characters removed, s = the text removed
  | 'large' // one edit inserted many characters at once (autocorrect, dictation, undo)
  | 'paste-blocked'
  | 'drop-blocked'
  | 'round-on'
  | 'round-off'
  | 'restore' // restored an earlier version (s = which)
  | 'away' // switched to another app or tab
  | 'back';

export interface LogEvent {
  t: number;
  k: LogKind;
  n?: number;
  /** Text typed, or for deletes the text removed. */
  s?: string;
  /** Who: the name entered on this device. */
  a?: string;
  /** Which device (random id per browser). */
  d?: string;
}

export interface LogBatch {
  seq: number;
  at: number;
  events: LogEvent[];
  prev: string;
  hash: string;
}

interface Head {
  seq: number;
  hash: string;
}

const store = createStore('pp-typing-log', 'log');
export const logChanged = createSignal();
const GENESIS = '0'.repeat(64);

const pending = new Map<string, LogEvent[]>();

/** Sends saved events on to the server's record (set by the app when signed in). */
let uploader: ((docId: string, events: LogEvent[]) => Promise<void>) | null = null;
export function setLogUploader(fn: typeof uploader) {
  uploader = fn;
}
const writing = new Map<string, Promise<void>>();
let timer: ReturnType<typeof setTimeout> | null = null;

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

const batchPayload = (b: Omit<LogBatch, 'hash'>) => JSON.stringify([b.seq, b.at, b.prev, b.events]);

/** Queue an event; batches are written about once a second. */
export function logEvent(docId: string, e: Omit<LogEvent, 't'> & { t?: number }) {
  const list = pending.get(docId) ?? [];
  const who = getProfile();
  list.push({ t: Date.now(), a: who.name || 'Unnamed', d: who.deviceId, ...e });
  pending.set(docId, list);
  if (!timer) timer = setTimeout(() => void flushLog(), 1000);
}

async function writeBatch(docId: string, events: LogEvent[]) {
  const head = ((await get(`head:${docId}`, store)) as Head | undefined) ?? { seq: 0, hash: GENESIS };
  const draft = { seq: head.seq + 1, at: Date.now(), events, prev: head.hash };
  const batch: LogBatch = { ...draft, hash: await sha256(batchPayload(draft)) };
  await set(`batch:${docId}:${batch.seq}`, batch, store);
  await set(`head:${docId}`, { seq: batch.seq, hash: batch.hash } satisfies Head, store);
}

export async function flushLog() {
  timer = null;
  const jobs: Promise<void>[] = [];
  for (const [docId, events] of pending) {
    pending.delete(docId);
    if (!events.length) continue;
    const prev = writing.get(docId) ?? Promise.resolve();
    const job = prev.then(async () => {
      await writeBatch(docId, events);
      if (uploader) void uploader(docId, events).catch(() => {});
    });
    writing.set(docId, job.catch(() => {}));
    jobs.push(job);
  }
  await Promise.all(jobs);
  if (jobs.length) logChanged.emit();
}

export interface LogReport {
  batches: LogBatch[];
  events: LogEvent[];
  /** True when every batch's hash matches and links to the one before. */
  intact: boolean;
  /** Short code from the newest hash, to note down at the end of prep. */
  seal: string | null;
}

export async function readLog(docId: string): Promise<LogReport> {
  await flushLog();
  const head = (await get(`head:${docId}`, store)) as Head | undefined;
  const batches: LogBatch[] = [];
  let intact = true;
  let prev = GENESIS;
  for (let seq = 1; head && seq <= head.seq; seq++) {
    const b = (await get(`batch:${docId}:${seq}`, store)) as LogBatch | undefined;
    if (!b) {
      intact = false;
      continue;
    }
    const { hash, ...rest } = b;
    if (b.prev !== prev || (await sha256(batchPayload(rest))) !== hash) intact = false;
    prev = hash;
    batches.push(b);
  }
  if (head && head.hash !== prev) intact = false;
  return {
    batches,
    events: batches.flatMap((b) => b.events),
    intact,
    seal: head ? `${head.hash.slice(0, 4)}-${head.hash.slice(4, 8)}`.toUpperCase() : null,
  };
}

export function summarizeLog(events: LogEvent[]) {
  let typed = 0;
  let deleted = 0;
  let blocked = 0;
  let large = 0;
  let awayMs = 0;
  let awaySince: number | null = null;
  for (const e of events) {
    if (e.k === 'type') typed += e.s?.length ?? e.n ?? 0;
    else if (e.k === 'delete') deleted += e.n ?? 0;
    else if (e.k === 'paste-blocked' || e.k === 'drop-blocked') blocked++;
    else if (e.k === 'large') large++;
    else if (e.k === 'away') awaySince = e.t;
    else if (e.k === 'back' && awaySince !== null) {
      awayMs += e.t - awaySince;
      awaySince = null;
    }
  }
  const byAuthor = new Map<string, { typed: number; deleted: number }>();
  for (const e of events) {
    if (e.k !== 'type' && e.k !== 'delete' && e.k !== 'large') continue;
    const key = e.a ?? 'Unnamed';
    const a = byAuthor.get(key) ?? { typed: 0, deleted: 0 };
    if (e.k === 'delete') a.deleted += e.n ?? 0;
    else a.typed += e.s?.length ?? e.n ?? 0;
    byAuthor.set(key, a);
  }
  const first = events[0]?.t ?? null;
  const last = events[events.length - 1]?.t ?? null;
  return { typed, deleted, blocked, large, awayMs, first, last, byAuthor };
}

/** A run of edits by one person with no pause longer than `gapMs`. */
export interface Burst {
  start: number;
  end: number;
  author: string;
  device?: string;
  /** Pieces in order: typed text, or removed text. */
  parts: { kind: 'typed' | 'removed' | 'large'; text: string }[];
}

/** Group typing and deleting into readable bursts for the full record. */
export function burstsOf(events: LogEvent[], gapMs = 4000): Burst[] {
  const out: Burst[] = [];
  let cur: Burst | null = null;
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
    if (last && last.kind === kind && kind !== 'large') last.text = kind === 'removed' ? text + last.text : last.text + text;
    else cur.parts.push({ kind, text });
  }
  return out;
}
