import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import { useEffect, useState } from 'react';
import { WebsocketProvider } from 'y-websocket';
import type * as Y from 'yjs';
import { createSignal } from './emitter';
import { getProfile } from '../settings/profile';

// Live sync with the ParliPrepRoom server (Cloudflare). Only used when the
// page is served by that server and someone is signed in (see account.ts);
// the server checks the sign-in cookie and who may open each doc.

/** A stable color per person, for their cursor and name tag. */
export function colorFor(seed: string): string {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `hsl(${h % 360} 70% 45%)`;
}

export function connect(docId: string, doc: Y.Doc): WebsocketProvider {
  const who = getProfile();
  const base = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/sync`;
  const provider = new WebsocketProvider(base, docId, doc);
  provider.awareness.setLocalStateField('user', { name: who.name || 'Unnamed', color: colorFor(who.deviceId) });
  watchConnection(provider, doc);
  guardReconnects(provider, docId, doc);
  return provider;
}

// ---------- Reconnecting ----------
// y-websocket retries every 2.5 seconds forever. That is right for a dropped
// wifi connection but wrong when the server says no (removed from the team,
// doc deleted or made private, session ended): an open tab would send about
// 34,000 refused requests a day. So: stop on "no access", stop after a few
// attempts in a row that never connected and check access before trying
// again, and back off for a minute when the server cut us off for flooding.

/** Close codes the server uses (worker/docRoom.ts). */
const NO_ACCESS = 4403;
const TOO_MANY_MESSAGES = 4429;
export const MAX_FAILED_ATTEMPTS = 5;

interface Reconnecting {
  on(event: string, fn: (...args: never[]) => void): void;
  connect(): void;
  disconnect(): void;
}
export interface GuardDeps {
  fetch: (url: string, init?: RequestInit) => Promise<{ ok: boolean; status: number }>;
  setTimeout: (fn: () => void, ms: number) => unknown;
  notify: (message: string) => void;
}
const realDeps: GuardDeps = {
  fetch: (url, init) => fetch(url, init),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  notify: (message) => {
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('pp-toast', { detail: message }));
  },
};

export function guardReconnects(provider: Reconnecting, docId: string, doc: Y.Doc | null, deps: GuardDeps = realDeps) {
  let wasConnected = false;
  let failures = 0;
  let paused = false; // we stopped it ourselves: ignore the close events that causes
  let timer: unknown = null;
  let notified = false;

  const pause = (waitMs: number, then: () => void) => {
    paused = true;
    provider.disconnect();
    timer = deps.setTimeout(then, waitMs);
  };
  const resume = () => {
    paused = false;
    failures = 0;
    provider.connect();
  };
  /** Still allowed? Then reconnect; refused for good? stay stopped; no answer? try again later. */
  const recheck = async (): Promise<void> => {
    try {
      const r = await deps.fetch(`/api/docs/${docId}`, { cache: 'no-store' });
      if (r.ok) return resume();
      if (r.status === 401 || r.status === 403 || r.status === 404) {
        if (!notified) deps.notify('You no longer have access to this doc. Your copy on this device is kept, but it is not syncing.');
        notified = true;
        return;
      }
    } catch {
      // offline or server down: try again below
    }
    timer = deps.setTimeout(() => void recheck(), 60_000);
  };

  provider.on('status', ((e: { status: string }) => {
    if (e.status === 'connected') {
      wasConnected = true;
      failures = 0;
    }
  }) as never);
  provider.on('connection-close', ((event: { code?: number } | null) => {
    if (paused) return;
    const code = event?.code;
    if (code === TOO_MANY_MESSAGES) return pause(60_000, resume);
    if (code === NO_ACCESS) return pause(30_000, () => void recheck());
    if (wasConnected) {
      // An ordinary drop after working: let y-websocket reconnect as usual.
      wasConnected = false;
      failures = 0;
      return;
    }
    if (++failures >= MAX_FAILED_ATTEMPTS) pause(30_000, () => void recheck());
  }) as never);
  doc?.on('destroy', () => {
    paused = true;
    if (timer !== null) clearTimeout(timer as number);
  });
}

// ---------- Connection check ----------
// Tap the dot in a pane header to see the round trip to the doc's server and
// whether your edits have reached it. Only runs while that panel is open.
// A ping goes down the same connection as the edits and the server answers
// it after saving everything sent before it, so an answer to a ping sent
// after your last edit means all your edits are saved there.

const MSG_PING = 99;

interface ConnState {
  /** Edits made on this device (counted since the doc was opened). */
  local: number;
  /** Edits the server has confirmed. */
  acked: number;
  rtts: number[];
  lastAnswerAt: number | null;
  nonce: number;
  waiting: Map<number, { sentAt: number; local: number }>;
  changed: ReturnType<typeof createSignal>;
}

const states = new WeakMap<WebsocketProvider, ConnState>();

function watchConnection(provider: WebsocketProvider, doc: Y.Doc) {
  const st: ConnState = { local: 0, acked: 0, rtts: [], lastAnswerAt: null, nonce: 0, waiting: new Map(), changed: createSignal() };
  states.set(provider, st);
  doc.on('update', (_u: Uint8Array, origin: unknown) => {
    if (origin === provider) return; // came from the server
    st.local++;
    st.changed.emit();
  });
  // Keep-alive. y-websocket decides a connection is dead after 30 seconds of
  // hearing nothing and closes and reopens it; our server is silent when
  // nobody is typing, so an idle open doc used to reconnect twice a minute,
  // all day. A ping every 20 seconds (echoed by the server) prevents that.
  const keepAlive = setInterval(() => ping(provider), 20_000);
  doc.on('destroy', () => clearInterval(keepAlive));
  provider.messageHandlers[MSG_PING] = (_enc, dec) => {
    const nonce = decoding.readVarUint(dec);
    const sent = st.waiting.get(nonce);
    if (!sent) return;
    st.waiting.delete(nonce);
    st.rtts = [...st.rtts.slice(-4), Math.round(performance.now() - sent.sentAt)];
    st.acked = Math.max(st.acked, sent.local);
    st.lastAnswerAt = Date.now();
    st.changed.emit();
  };
}

function ping(provider: WebsocketProvider) {
  const st = states.get(provider);
  if (!st || !provider.wsconnected || !provider.ws) return;
  const nonce = ++st.nonce;
  st.waiting.set(nonce, { sentAt: performance.now(), local: st.local });
  // Forget pings that never came back (e.g. the connection dropped).
  for (const [n, w] of st.waiting) if (performance.now() - w.sentAt > 15_000) st.waiting.delete(n);
  const enc = encoding.createEncoder();
  encoding.writeVarUint(enc, MSG_PING);
  encoding.writeVarUint(enc, nonce);
  provider.ws.send(encoding.toUint8Array(enc));
}

export interface ConnectionCheck {
  /** Latest round trip in ms (null until the first answer). */
  rtt: number | null;
  /** Middle of the last few round trips. */
  typical: number | null;
  /** Edits on this device the server hasn't confirmed yet. */
  unsaved: number;
  /** A ping has gone unanswered for over 5 seconds. */
  slow: boolean;
  checked: boolean;
}

/** Ping the doc's server every 2 seconds while `active` (the panel is open). */
export function useConnectionCheck(provider: WebsocketProvider | null, active: boolean): ConnectionCheck {
  const [, setTick] = useState(0);
  useEffect(() => {
    const st = provider ? states.get(provider) : undefined;
    if (!provider || !st || !active) return;
    const off = st.changed.subscribe(() => setTick((t) => t + 1));
    ping(provider);
    const t = setInterval(() => {
      ping(provider);
      setTick((x) => x + 1);
    }, 2000);
    return () => {
      off();
      clearInterval(t);
    };
  }, [provider, active]);
  const st = provider ? states.get(provider) : undefined;
  if (!st) return { rtt: null, typical: null, unsaved: 0, slow: false, checked: false };
  const sorted = [...st.rtts].sort((a, b) => a - b);
  const oldestWait = Math.min(...[...st.waiting.values()].map((w) => w.sentAt));
  return {
    rtt: st.rtts.at(-1) ?? null,
    typical: sorted.length ? sorted[Math.floor(sorted.length / 2)] : null,
    unsaved: Math.max(0, st.local - st.acked),
    slow: st.waiting.size > 0 && performance.now() - oldestWait > 5000,
    checked: st.lastAnswerAt !== null,
  };
}

export type SyncStatus = 'off' | 'connecting' | 'synced' | 'offline';

/** Connection state of a document, for the little indicator in the pane header. */
export function useSyncStatus(provider: WebsocketProvider | null): SyncStatus {
  const [status, setStatus] = useState<SyncStatus>(provider ? (provider.synced ? 'synced' : 'connecting') : 'off');
  useEffect(() => {
    if (!provider) {
      setStatus('off');
      return;
    }
    const update = () => setStatus(provider.wsconnected ? (provider.synced ? 'synced' : 'connecting') : provider.wsconnecting ? 'connecting' : 'offline');
    update();
    provider.on('status', update);
    provider.on('sync', update);
    return () => {
      provider.off('status', update);
      provider.off('sync', update);
    };
  }, [provider]);
  return status;
}
