import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CURSOR_INTERVAL_MS, noEcho, slowPresenceTimer, startKeepAlive, throttleUpdates, type Changes } from '../src/store/presence';

const change = (updated: number[], removed: number[] = []): Changes => ({ added: [], updated, removed });

describe('no echo', () => {
  it('sends updates made here, not ones that came from the server', () => {
    const provider = {};
    const sent: Changes[] = [];
    const handler = noEcho((c) => void sent.push(c), provider);
    handler(change([1]), 'local');
    handler(change([2]), provider); // arrived over the socket
    handler(change([3], [3]), 'window unload');
    expect(sent.map((c) => c.updated)).toEqual([[1], [3]]);
  });
});

describe('cursor throttle', () => {
  // A fake clock: timers run when the test says so.
  let timers: { fn: () => void; at: number }[];
  let clock: number;
  const t = {
    now: () => clock,
    setTimeout: (fn: () => void, ms: number) => {
      timers.push({ fn, at: clock + ms });
      return timers.length;
    },
    clearTimeout: () => {},
  };
  const advance = (ms: number) => {
    clock += ms;
    for (const due of timers.filter((x) => x.at <= clock)) {
      timers.splice(timers.indexOf(due), 1);
      due.fn();
    }
  };
  beforeEach(() => {
    timers = [];
    clock = 0;
  });

  it('sends the first update at once and at most one more per window', () => {
    const sent: Changes[] = [];
    const { handler } = throttleUpdates((c) => void sent.push(c), CURSOR_INTERVAL_MS, t);
    for (let i = 0; i < 10; i++) handler(change([7]), 'local'); // ten key presses in a burst
    expect(sent).toHaveLength(1);
    advance(CURSOR_INTERVAL_MS);
    expect(sent).toHaveLength(2); // the trailing update, with the latest state
    advance(CURSOR_INTERVAL_MS);
    expect(sent).toHaveLength(2); // nothing pending: stays quiet
  });

  it('merges different people’s changes in the window', () => {
    const sent: Changes[] = [];
    const { handler } = throttleUpdates((c) => void sent.push(c), CURSOR_INTERVAL_MS, t);
    handler(change([1]), 'local');
    handler(change([2]), 'local');
    handler(change([3]), 'local');
    advance(CURSOR_INTERVAL_MS);
    expect(sent[1].updated.sort()).toEqual([2, 3]);
  });

  it('about 2 updates a second while someone types continuously', () => {
    const sent: Changes[] = [];
    const { handler } = throttleUpdates((c) => void sent.push(c), CURSOR_INTERVAL_MS, t);
    for (let step = 0; step < 50; step++) {
      handler(change([1]), 'local'); // a key press every 200 ms for 10 s
      advance(200);
    }
    expect(sent.length).toBeLessThanOrEqual(21);
    expect(sent.length).toBeGreaterThanOrEqual(15); // 50 key presses became about 17 updates
  });

  it('sends a person leaving immediately, along with anything waiting', () => {
    const sent: Changes[] = [];
    const { handler } = throttleUpdates((c) => void sent.push(c), CURSOR_INTERVAL_MS, t);
    handler(change([1]), 'local');
    handler(change([2]), 'local'); // waiting
    handler(change([], [9]), 'window unload');
    expect(sent).toHaveLength(2);
    expect(sent[1]).toMatchObject({ removed: [9], updated: [2] });
  });
});

describe('slower presence', () => {
  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => void vi.useRealTimers());

  function awarenessWith(self: number, others: Record<number, number>) {
    const meta = new Map<number, { clock: number; lastUpdated: number }>([[self, { clock: 1, lastUpdated: 0 }]]);
    const states = new Map<number, unknown>([[self, { user: 'me' }]]);
    for (const [id, last] of Object.entries(others)) {
      meta.set(Number(id), { clock: 1, lastUpdated: last });
      states.set(Number(id), { user: 'them' });
    }
    const renewed: unknown[] = [];
    return {
      clientID: self,
      meta,
      states,
      getLocalState: () => states.get(self),
      setLocalState: (s: unknown) => void renewed.push(s),
      _checkInterval: setInterval(() => {}, 1_000_000),
      renewed,
    };
  }

  it('renews my presence after a minute, not 15 seconds', () => {
    let now = 0;
    const a = awarenessWith(1, {});
    slowPresenceTimer(a, { now: () => now, remove: vi.fn() });
    now = 20_000;
    vi.advanceTimersByTime(10_000);
    expect(a.renewed).toHaveLength(0);
    now = 61_000;
    vi.advanceTimersByTime(10_000);
    expect(a.renewed).toHaveLength(1);
  });

  it('removes someone not heard from for 2.5 minutes, but not before', () => {
    let now = 0;
    const remove = vi.fn();
    const a = awarenessWith(1, { 2: 0 });
    slowPresenceTimer(a, { now: () => now, remove });
    now = 100_000;
    vi.advanceTimersByTime(10_000);
    expect(remove).not.toHaveBeenCalled();
    now = 151_000;
    vi.advanceTimersByTime(10_000);
    expect(remove).toHaveBeenCalledWith(a, [2], 'timeout');
  });
});

describe('keep-alive', () => {
  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => void vi.useRealTimers());

  function fakeProvider() {
    const sent: string[] = [];
    const handlers: ((e: { status: string }) => void)[] = [];
    const binary = vi.fn();
    const ws = { onmessage: binary as ((e: { data: unknown }) => void) | null, send: (m: string) => void sent.push(m) };
    const provider = { ws, wsconnected: true, wsLastMessageReceived: 0, on: (_: string, fn: (e: { status: string }) => void) => void handlers.push(fn) };
    return { provider, ws, sent, binary, connect: () => handlers.forEach((h) => h({ status: 'connected' })) };
  }

  it('pings every 20 seconds while connected', () => {
    const f = fakeProvider();
    startKeepAlive(f.provider);
    vi.advanceTimersByTime(60_000);
    expect(f.sent).toEqual(['ping', 'ping', 'ping']);
  });

  it('stays quiet while disconnected', () => {
    const f = fakeProvider();
    f.provider.wsconnected = false;
    startKeepAlive(f.provider);
    vi.advanceTimersByTime(60_000);
    expect(f.sent).toEqual([]);
  });

  it('counts a text reply as "heard from the server" without passing it to the sync code', () => {
    const f = fakeProvider();
    startKeepAlive(f.provider);
    f.connect();
    vi.setSystemTime(50_000);
    f.ws.onmessage!({ data: 'pong' });
    expect(f.provider.wsLastMessageReceived).toBe(50_000);
    expect(f.binary).not.toHaveBeenCalled();
    f.ws.onmessage!({ data: new ArrayBuffer(2) });
    expect(f.binary).toHaveBeenCalledTimes(1); // real sync messages still go through
  });

  it('stops when told to', () => {
    const f = fakeProvider();
    const stop = startKeepAlive(f.provider);
    stop();
    vi.advanceTimersByTime(60_000);
    expect(f.sent).toEqual([]);
  });
});

describe('with the real sync library', () => {
  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => void vi.useRealTimers());

  async function setup() {
    const { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } = await import('y-protocols/awareness');
    const { WebsocketProvider } = await import('y-websocket');
    const Y = await import('yjs');
    const { slimTraffic } = await import('../src/store/presence');
    const doc = new Y.Doc();
    const provider = new WebsocketProvider('ws://example.test', 'room', doc, { connect: false, disableBc: true });
    const sent: Uint8Array[] = [];
    const fake = provider as unknown as { wsconnected: boolean; ws: unknown };
    fake.wsconnected = true;
    fake.ws = { send: (m: Uint8Array) => void sent.push(m), close: () => {}, readyState: 1, OPEN: 1 };
    slimTraffic(provider as never, doc);
    const remote = new Awareness(new Y.Doc());
    remote.setLocalState({ user: 'ann' });
    const arrive = () => applyAwarenessUpdate(provider.awareness, encodeAwarenessUpdate(remote, [remote.clientID]), provider);
    return { provider, sent, arrive, remote };
  }

  it('never sends a cursor update back that arrived from the server, even after the throttle window', async () => {
    const t = await setup();
    t.sent.length = 0;
    t.arrive();
    t.remote.setLocalState({ user: 'ann', cursor: 1 });
    t.arrive(); // a second one inside the window would be queued by a wrongly ordered throttle
    vi.advanceTimersByTime(5_000);
    expect(t.sent).toHaveLength(0);
  });

  it('still sends this person’s own cursor changes, at most twice a second', async () => {
    const t = await setup();
    t.sent.length = 0;
    for (let i = 0; i < 20; i++) {
      t.provider.awareness.setLocalStateField('cursor', i);
      vi.advanceTimersByTime(100); // 20 key presses over 2 seconds
    }
    vi.advanceTimersByTime(1_000);
    expect(t.sent.length).toBeGreaterThanOrEqual(3);
    expect(t.sent.length).toBeLessThanOrEqual(6);
  });
});
