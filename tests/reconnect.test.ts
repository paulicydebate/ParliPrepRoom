import { describe, expect, it } from 'vitest';
import { MAX_FAILED_ATTEMPTS, guardReconnects, type GuardDeps } from '../src/store/sync';

// A stand-in for the y-websocket provider that lets a test fire its events.
function setup(answer: () => Promise<{ ok: boolean; status: number }>) {
  const handlers = new Map<string, (arg: never) => void>();
  const calls: string[] = [];
  const timers: (() => void)[] = [];
  const toasts: string[] = [];
  const provider = {
    on: (event: string, fn: (arg: never) => void) => void handlers.set(event, fn),
    connect: () => void calls.push('connect'),
    disconnect: () => void calls.push('disconnect'),
  };
  const deps: GuardDeps = {
    fetch: () => answer(),
    setTimeout: (fn) => void timers.push(fn),
    notify: (m) => void toasts.push(m),
  };
  guardReconnects(provider, 'doc1', null, deps);
  const fire = (event: string, arg?: unknown) => handlers.get(event)!(arg as never);
  const runTimer = async () => {
    timers.shift()!();
    await new Promise((r) => setTimeout(r, 0));
  };
  return { calls, timers, toasts, fire, runTimer };
}

describe('reconnecting', () => {
  it('lets an ordinary dropped connection reconnect by itself', () => {
    const t = setup(async () => ({ ok: true, status: 200 }));
    t.fire('status', { status: 'connected' });
    for (let i = 0; i < 20; i++) {
      t.fire('connection-close', { code: 1006 });
      t.fire('status', { status: 'connected' });
    }
    expect(t.calls).toEqual([]);
  });

  it('stops after repeated attempts that never connect, then checks access before trying again', async () => {
    const t = setup(async () => ({ ok: true, status: 200 }));
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) t.fire('connection-close', { code: 1006 });
    expect(t.calls).toEqual(['disconnect']);
    await t.runTimer();
    expect(t.calls).toEqual(['disconnect', 'connect']); // access is fine, so it reconnects
  });

  it('stays stopped when the server says there is no access, and tells the user once', async () => {
    const t = setup(async () => ({ ok: false, status: 403 }));
    t.fire('connection-close', { code: 4403 });
    expect(t.calls).toEqual(['disconnect']);
    await t.runTimer();
    expect(t.calls).toEqual(['disconnect']);
    expect(t.timers).toHaveLength(0); // no more retries scheduled
    expect(t.toasts).toHaveLength(1);
  });

  it('keeps trying slowly when the access check itself cannot be reached', async () => {
    let up = false;
    const t = setup(async () => {
      if (!up) throw new Error('offline');
      return { ok: true, status: 200 };
    });
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) t.fire('connection-close', { code: 1006 });
    await t.runTimer();
    expect(t.timers).toHaveLength(1); // scheduled another check
    up = true;
    await t.runTimer();
    expect(t.calls).toEqual(['disconnect', 'connect']);
  });

  it('backs off when the server cut it off for sending too much', async () => {
    const t = setup(async () => ({ ok: true, status: 200 }));
    t.fire('connection-close', { code: 4429 });
    expect(t.calls).toEqual(['disconnect']);
    await t.runTimer();
    expect(t.calls).toEqual(['disconnect', 'connect']);
  });

  it('ignores the close events caused by its own pause', () => {
    const t = setup(async () => ({ ok: true, status: 200 }));
    t.fire('connection-close', { code: 4403 });
    for (let i = 0; i < 10; i++) t.fire('connection-close', { code: 1005 });
    expect(t.calls).toEqual(['disconnect']);
  });

  it('stops for a while when the server closed this tab because too many are open', () => {
    const t = setup(async () => ({ ok: true, status: 200 }));
    t.fire('status', { status: 'connected' });
    t.fire('connection-close', { code: 4408 });
    expect(t.calls).toEqual(['disconnect']);
    expect(t.toasts.length).toBe(1);
  });
});
