import { removeAwarenessStates } from 'y-protocols/awareness';

// Keeping live cursors without flooding the server.
//
// y-websocket's defaults are built for a server that doesn't mind traffic.
// Ours charges for every message, and measured at 3 messages per typed
// character (EFFICIENCY.md). Four changes, none of which changes what people
// see apart from cursors moving in half-second steps:
//   1. no echo: a cursor update that came FROM the server is not sent back;
//   2. cursor updates go out at most twice a second;
//   3. presence is renewed every minute (not every 15 s), so an idle open doc
//      is nearly silent; people who vanish without saying goodbye disappear
//      after 2.5 minutes (not 30 s);
//   4. the connection is kept alive with a free "ping" that Cloudflare answers
//      itself (no doc wake-up, no billed request).

export interface Changes {
  added: number[];
  updated: number[];
  removed: number[];
}
export type UpdateHandler = (changes: Changes, origin: unknown) => void;

/** Cursor updates are sent at most this often. */
export const CURSOR_INTERVAL_MS = 500;
/** Presence is renewed this often when nothing else changed... */
export const RENEW_MS = 60_000;
/** ...and someone not heard from for this long is treated as gone. */
export const OUTDATED_MS = 150_000;
/** Keep-alive ping interval (the connection is treated as dead after 30 s of silence). */
export const KEEP_ALIVE_MS = 20_000;

interface Timers {
  now: () => number;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (id: unknown) => void;
}
const realTimers: Timers = { now: () => Date.now(), setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (id) => clearTimeout(id as number) };

const union = (a: number[], b: number[]) => [...new Set([...a, ...b])];
const merge = (a: Changes | null, b: Changes): Changes =>
  a ? { added: union(a.added, b.added), updated: union(a.updated, b.updated), removed: union(a.removed, b.removed) } : b;

/** Only updates made on this device are sent on; ones that arrived from the server are not echoed back. */
export function noEcho(send: UpdateHandler, provider: unknown): UpdateHandler {
  return (changes, origin) => {
    if (origin === provider) return;
    send(changes, origin);
  };
}

/**
 * Leading and trailing throttle: the first update goes out at once, later ones
 * within the window are merged and sent when it ends. People leaving (removals)
 * always go out immediately.
 */
export function throttleUpdates(send: UpdateHandler, intervalMs = CURSOR_INTERVAL_MS, t: Timers = realTimers) {
  let cooling = false;
  let pending: Changes | null = null;
  let timer: unknown = null;
  const cool = () => {
    cooling = true;
    timer = t.setTimeout(() => {
      timer = null;
      cooling = false;
      if (pending) {
        const p = pending;
        pending = null;
        send(p, 'local');
        cool();
      }
    }, intervalMs);
  };
  const handler: UpdateHandler = (changes, origin) => {
    if (changes.removed.length) {
      const all = merge(pending, changes);
      pending = null;
      send(all, origin);
      return;
    }
    if (!cooling) {
      send(changes, origin);
      cool();
    } else pending = merge(pending, changes);
  };
  return { handler, stop: () => void (timer !== null && t.clearTimeout(timer)) };
}

interface AwarenessInternals {
  clientID: number;
  meta: Map<number, { clock: number; lastUpdated: number }>;
  states: Map<number, unknown>;
  getLocalState(): unknown;
  setLocalState(state: unknown): void;
  _checkInterval: ReturnType<typeof setInterval>;
}

/**
 * Replace y-protocols' 15-second renewal and 30-second timeout (module
 * constants that can't be configured) with slower ones.
 */
export function slowPresenceTimer(
  awareness: AwarenessInternals,
  opts: { renewMs?: number; outdatedMs?: number; now?: () => number; remove?: (a: never, ids: number[], origin: string) => void } = {},
) {
  const { renewMs = RENEW_MS, outdatedMs = OUTDATED_MS, now = () => Date.now(), remove = removeAwarenessStates as never } = opts;
  clearInterval(awareness._checkInterval);
  awareness._checkInterval = setInterval(() => {
    const t = now();
    const local = awareness.getLocalState();
    const mine = awareness.meta.get(awareness.clientID);
    if (local !== null && mine && renewMs <= t - mine.lastUpdated) awareness.setLocalState(local);
    const gone: number[] = [];
    awareness.meta.forEach((m, id) => {
      if (id !== awareness.clientID && outdatedMs <= t - m.lastUpdated && awareness.states.has(id)) gone.push(id);
    });
    if (gone.length) remove(awareness as never, gone, 'timeout');
  }, 10_000);
}

interface Socketish {
  onmessage: ((e: { data: unknown }) => void) | null;
  send(data: string): void;
}
interface KeepAliveProvider {
  ws: Socketish | null;
  wsconnected: boolean;
  wsLastMessageReceived: number;
  on(event: string, fn: (e: { status: string }) => void): void;
}

/**
 * Send "ping" every so often; the server's edge answers "pong" by itself.
 * y-websocket expects binary messages and only uses "a message arrived" to
 * spot dead connections, so text replies are counted and then dropped.
 */
export function startKeepAlive(provider: KeepAliveProvider, everyMs = KEEP_ALIVE_MS): () => void {
  provider.on('status', (e) => {
    if (e.status !== 'connected' || !provider.ws) return;
    const ws = provider.ws;
    const original = ws.onmessage;
    ws.onmessage = (event) => {
      if (typeof event.data === 'string') {
        provider.wsLastMessageReceived = Date.now();
        return;
      }
      original?.(event);
    };
  });
  const timer = setInterval(() => {
    if (provider.wsconnected && provider.ws) {
      try {
        provider.ws.send('ping');
      } catch {
        // the connection is closing; y-websocket will reconnect
      }
    }
  }, everyMs);
  return () => clearInterval(timer);
}

/** Apply all four changes to a provider (see the notes at the top of this file). */
export function slimTraffic(provider: KeepAliveProvider & { awareness: AwarenessInternals & { on(e: string, f: UpdateHandler): void; off(e: string, f: UpdateHandler): void } }, doc: { on(e: string, f: () => void): void }) {
  const original = (provider as unknown as { _awarenessUpdateHandler: UpdateHandler })._awarenessUpdateHandler;
  provider.awareness.off('update', original);
  // Order matters: updates that came from the server are dropped BEFORE the throttle, otherwise
  // the throttle queues them and sends them later as if they were ours.
  const throttled = throttleUpdates(original);
  provider.awareness.on('update', noEcho(throttled.handler, provider));
  slowPresenceTimer(provider.awareness);
  const stopKeepAlive = startKeepAlive(provider);
  doc.on('destroy', () => {
    throttled.stop();
    stopKeepAlive();
  });
}
