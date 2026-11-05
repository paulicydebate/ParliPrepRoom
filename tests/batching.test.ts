import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { batchEdits } from '../src/store/presence';

// Two people editing at once through the real batching code, with a fake network.
function peer(name: string, batching: boolean, ms = 300) {
  const doc = new Y.Doc();
  const sent: Uint8Array[] = [];
  const provider = { _updateHandler: (u: Uint8Array, o: unknown) => { if (o !== provider) sent.push(u); } };
  doc.on('update', provider._updateHandler);
  const b = batching ? batchEdits(provider, doc as never, (u) => Y.mergeUpdates(u), ms) : null;
  return { name, doc, sent, provider, b, text: doc.getText('default') };
}
const deliver = (from: ReturnType<typeof peer>, to: ReturnType<typeof peer>) => {
  for (const u of from.sent.splice(0)) Y.applyUpdate(to.doc, u, to.provider);
};
const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

describe('batching outgoing edits', () => {
  it('merges a burst into one message and applies the same text', () => {
    vi.useFakeTimers();
    const a = peer('a', true);
    const b = peer('b', true);
    for (const ch of 'hello world') a.text.insert(a.text.length, ch);
    expect(a.sent.length).toBe(0);
    vi.advanceTimersByTime(300);
    expect(a.sent.length).toBe(1);
    deliver(a, b);
    expect(b.text.toString()).toBe('hello world');
    vi.useRealTimers();
  });

  it('never sends back what came from the server', () => {
    vi.useFakeTimers();
    const a = peer('a', true);
    const b = peer('b', true);
    a.text.insert(0, 'x');
    vi.advanceTimersByTime(300);
    deliver(a, b);
    vi.advanceTimersByTime(1000);
    expect(b.sent.length).toBe(0);
    vi.useRealTimers();
  });

  it('flush sends at once', () => {
    vi.useFakeTimers();
    const a = peer('a', true);
    a.text.insert(0, 'abc');
    a.b!.flush();
    expect(a.sent.length).toBe(1);
    vi.useRealTimers();
  });

  for (const batching of [true, false]) {
    it(`two people typing at once converge (batching ${batching ? 'on' : 'off'}), 40 random runs`, () => {
      vi.useFakeTimers();
      for (let seed = 1; seed <= 40; seed++) {
        const r = rng(seed);
        const a = peer('a', batching);
        const b = peer('b', batching);
        let offline = false;
        for (let step = 0; step < 120; step++) {
          const p = r() < 0.5 ? a : b;
          const len = p.text.length;
          if (len > 3 && r() < 0.25) p.text.delete(Math.floor(r() * len), 1 + Math.floor(r() * 2));
          else p.text.insert(Math.floor(r() * (len + 1)), String.fromCharCode(97 + Math.floor(r() * 26)));
          if (r() < 0.1) offline = !offline; // b drops off the network for a while
          vi.advanceTimersByTime(Math.floor(r() * 250));
          if (r() < 0.5) {
            deliver(a, b.name && !offline ? b : a === b ? a : b); // a to b unless b is offline
            if (!offline) deliver(b, a);
          }
        }
        // Reconnect: both sync fully (what the sync handshake does), then the pending sends arrive.
        a.b?.flush();
        b.b?.flush();
        offline = false;
        Y.applyUpdate(a.doc, Y.encodeStateAsUpdate(b.doc), b.provider);
        Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc), a.provider);
        deliver(a, b);
        deliver(b, a);
        expect(a.text.toString()).toBe(b.text.toString());
        expect(Y.encodeStateVector(a.doc)).toEqual(Y.encodeStateVector(b.doc));
      }
      vi.useRealTimers();
    });
  }

  it('batched and unbatched give the same final text for the same edits', () => {
    vi.useFakeTimers();
    const run = (batching: boolean) => {
      const r = rng(7);
      const a = peer('a', batching);
      const b = peer('b', batching);
      for (let i = 0; i < 200; i++) {
        const p = r() < 0.5 ? a : b;
        p.text.insert(Math.floor(r() * (p.text.length + 1)), 'abcdefgh'[Math.floor(r() * 8)]);
        vi.advanceTimersByTime(100);
        deliver(a, b);
        deliver(b, a);
      }
      a.b?.flush();
      b.b?.flush();
      deliver(a, b);
      deliver(b, a);
      return [a.text.toString(), b.text.toString()];
    };
    const on = run(true);
    expect(on[0]).toBe(on[1]);
    const off = run(false);
    expect(off[0]).toBe(off[1]);
    vi.useRealTimers();
  });
});
