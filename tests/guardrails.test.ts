// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { newContext } from './stubs/cloudflare-workers';
import { DEFAULT_PAUSE_NOTICE, Directory } from '../worker/directory';
import { DocRoom, MAX_SOCKETS_PER_PERSON } from '../worker/docRoom';

describe('pause switch (kill switch)', () => {
  let dir: Directory;
  beforeEach(() => {
    dir = new Directory(newContext() as never, {} as never);
  });
  it('is off by default, turns on with a notice and off again', () => {
    expect(dir.pauseState()).toEqual({ paused: false, notice: '' });
    dir.setPause(true, 'Back at 5pm');
    expect(dir.pauseState()).toEqual({ paused: true, notice: 'Back at 5pm' });
    dir.setPause(true);
    expect(dir.pauseState().notice).toBe(DEFAULT_PAUSE_NOTICE);
    dir.setPause(false);
    expect(dir.pauseState().paused).toBe(false);
  });
});

describe('per-person call limit', () => {
  it('allows 60 a minute per key, then refuses until the minute is over', () => {
    const dir = new Directory(newContext() as never, {} as never);
    const t = 1_000_000;
    for (let i = 0; i < 60; i++) expect(dir.allow('a', 60, t + i)).toBe(true);
    expect(dir.allow('a', 60, t + 100)).toBe(false);
    expect(dir.allow('b', 60, t + 100)).toBe(true);
    expect(dir.allow('a', 60, t + 61_000)).toBe(true);
  });
});

describe('open tabs per person per doc', () => {
  it('closes the oldest tabs beyond the limit and never someone else’s', async () => {
    const closed: string[] = [];
    const mk = (id: string, n: number) => ({ deserializeAttachment: () => ({ id, name: id }), close: () => void closed.push(`${id}${n}`) });
    const existing = [...Array.from({ length: MAX_SOCKETS_PER_PERSON }, (_, i) => mk('u1', i)), mk('u2', 0)];
    const c = newContext();
    (c as unknown as { getWebSockets: () => unknown[] }).getWebSockets = () => existing;
    (globalThis as unknown as { WebSocketPair: unknown }).WebSocketPair = class {
      0 = { send() {} };
      1 = { send() {}, serializeAttachment() {} };
    };
    (c as unknown as { acceptWebSocket: () => void }).acceptWebSocket = () => {};
    const room = new DocRoom(c as never, {} as never);
    const req = new Request('https://x/api/sync/doc', { headers: { Upgrade: 'websocket', 'x-pp-user': JSON.stringify({ id: 'u1', name: 'Ann' }) } });
    try {
      await room.fetch(req).catch(() => undefined); // the 101 response is not constructible in node; closing happens first
    } catch {
      /* ignore */
    }
    expect(closed).toEqual(['u10']);
    delete (globalThis as unknown as { WebSocketPair?: unknown }).WebSocketPair;
  });
});
