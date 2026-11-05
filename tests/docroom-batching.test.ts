// @vitest-environment node
import * as encoding from 'lib0/encoding';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newContext, type FakeSql } from './stubs/cloudflare-workers';
import { DocRoom } from '../worker/docRoom';
import { summarizeRecord } from '../worker/summary';

// Step 2 of EFFICIENCY.md on the server: one saved row per person per second
// (not per key press), snapshots so a woken room does not re-read its whole
// history, and a running summary so the coach pages do not replay everything.

type Ctx = ReturnType<typeof newContext>;
let ctx: Ctx;
let sql: FakeSql;
let room: DocRoom;
const sockets = new Map<string, WebSocket>();
const relayed: Record<string, Uint8Array[]> = {};

function socket(id: string, name = id): WebSocket {
  let s = sockets.get(id);
  if (!s) {
    relayed[id] = [];
    // The room tells a real connection from the server by `instanceof WebSocket`, so make these look real.
    s = Object.assign(Object.create(WebSocket.prototype), {
      deserializeAttachment: () => ({ id, name }),
      serializeAttachment: () => {},
      send: (m: Uint8Array) => void relayed[id].push(m),
      close: () => {},
    }) as WebSocket;
    sockets.set(id, s);
  }
  return s;
}

const bytes = (b: Uint8Array) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

/** A sync message with one typed edit (sync "update") or a catch-up (sync step 2), as a browser would send it. */
function update(text: string, kind: 'update' | 'step2' = 'update'): ArrayBuffer {
  const doc = new Y.Doc();
  let u: Uint8Array = new Uint8Array();
  doc.on('update', (x: Uint8Array) => (u = x));
  doc.getText('t').insert(0, text);
  const enc = encoding.createEncoder();
  encoding.writeVarUint(enc, 0);
  if (kind === 'update') syncProtocol.writeUpdate(enc, u);
  else syncProtocol.writeSyncStep2(enc, doc);
  return bytes(encoding.toUint8Array(enc));
}

/** Move the clock on and wait for anything the room was saving (its checksums finish on the real clock). */
const writesOf = () => (room as unknown as { writes: Promise<void> }).writes;
const pass = async (ms: number) => {
  await vi.advanceTimersByTimeAsync(ms);
  await writesOf();
};
const rows = () => sql.exec('SELECT COUNT(*) AS n FROM updates').toArray()[0].n as number;
const rowList = () => sql.exec('SELECT seq, user_id, via, at FROM updates ORDER BY seq').toArray();
/** Rebuild the document from every saved row (what a full replay gives). */
const replay = () => {
  const d = new Y.Doc();
  for (const r of sql.exec('SELECT data FROM updates ORDER BY seq').toArray()) Y.applyUpdate(d, new Uint8Array(r.data as ArrayBuffer));
  return d;
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_700_000_000_000);
  ctx = newContext();
  sql = ctx.storage.sql;
  room = new DocRoom(ctx as never, {} as never);
  sockets.clear();
});
afterEach(() => void vi.useRealTimers());

describe('one saved row per person per second', () => {
  it('merges one person’s edits in the same second into a single row, saved after about a second', async () => {
    const ann = socket('u1', 'Ann');
    for (const t of ['h', 'e', 'l', 'l', 'o']) {
      await room.webSocketMessage(ann, update(t));
      vi.advanceTimersByTime(100);
    }
    expect(rows()).toBe(0); // still waiting for the second to be up
    await pass(1_000);
    expect(rows()).toBe(1);
    const rec = await room.record(true);
    expect(rec.updates).toHaveLength(1);
    expect(rec.updates[0].inserted).toBe(5);
    expect([...rec.updates[0].text!].sort().join('')).toBe('ehllo'); // every character is in the record
    expect(rec.intact).toBe(true);
  });

  it('a second later starts a new row', async () => {
    const ann = socket('u1', 'Ann');
    await room.webSocketMessage(ann, update('a'));
    await pass(1_200);
    await room.webSocketMessage(ann, update('b'));
    await pass(1_200);
    expect(rows()).toBe(2);
  });

  it('keeps different people in different rows, in the order they started', async () => {
    const ann = socket('u1', 'Ann');
    const bea = socket('u2', 'Bea');
    await room.webSocketMessage(ann, update('a1'));
    vi.advanceTimersByTime(50);
    await room.webSocketMessage(bea, update('b1'));
    vi.advanceTimersByTime(50);
    await room.webSocketMessage(ann, update('a2'));
    await pass(1_200);
    expect(rowList().map((r) => r.user_id)).toEqual(['u1', 'u2']);
    const rec = await room.record(true);
    expect(rec.updates.map((u) => [u.name, u.inserted])).toEqual([['Ann', 4], ['Bea', 2]]);
  });

  it('does not mix typed-live edits with catch-up after being offline', async () => {
    const ann = socket('u1', 'Ann');
    await room.webSocketMessage(ann, update('live'));
    await room.webSocketMessage(ann, update('offline stuff', 'step2'));
    await pass(1_200);
    expect(rowList().map((r) => r.via).sort()).toEqual(['catchup', 'live']);
  });

  it('saves at once when 200 edits pile up', async () => {
    const ann = socket('u1', 'Ann');
    for (let i = 0; i < 200; i++) await room.webSocketMessage(ann, update('x'));
    await pass(0);
    expect(rows()).toBe(1);
  });

  it('still passes every edit on to the other people straight away', async () => {
    const ann = socket('u1', 'Ann');
    const bea = socket('u2', 'Bea');
    (ctx as unknown as { getWebSockets: () => unknown[] }).getWebSockets = () => [ann, bea];
    await room.webSocketMessage(ann, update('hi'));
    expect(relayed['u2']).toHaveLength(1); // relayed before anything is saved
    expect(rows()).toBe(0);
  });

  it('answers a connection check only after saving, so "all saved" is true', async () => {
    const ann = socket('u1', 'Ann');
    await room.webSocketMessage(ann, update('typed'));
    expect(rows()).toBe(0);
    await room.webSocketMessage(ann, new Uint8Array([99, 1]).buffer as ArrayBuffer);
    expect(rows()).toBe(1);
    expect(relayed['u1'].at(-1)).toEqual(new Uint8Array([99, 1]));
  });

  it('saves when the browser disconnects, and when the record, history or state is asked for', async () => {
    const ann = socket('u1', 'Ann');
    await room.webSocketMessage(ann, update('a'));
    await room.webSocketClose(ann, 1000);
    await pass(0);
    expect(rows()).toBe(1);
    await room.webSocketMessage(ann, update('b'));
    await room.state();
    expect(rows()).toBe(2);
    await room.webSocketMessage(ann, update('c'));
    expect((await room.log()).length).toBe(3);
  });

  it('after a restart, at most the last unsaved second is missing and the room still loads', async () => {
    const ann = socket('u1', 'Ann');
    await room.webSocketMessage(ann, update('saved'));
    await pass(1_200);
    await room.webSocketMessage(ann, update('unsaved'));
    const restarted = new DocRoom(ctx as never, {} as never); // the old room's pending edits are lost
    const d = new Y.Doc();
    Y.applyUpdate(d, await restarted.state());
    expect(d.getText('t').toString()).toBe('saved');
  });

  it('one failed save is noted and later saves carry on', async () => {
    const ann = socket('u1', 'Ann');
    await room.webSocketMessage(ann, update('one'));
    await room.state();
    sql.failWhen = (q) => q.includes('INSERT INTO updates');
    await room.webSocketMessage(ann, update('lost'));
    await room.state();
    sql.failWhen = null;
    await room.webSocketMessage(ann, update('three'));
    await room.state();
    expect(rows()).toBe(2);
    expect((await room.record(false)).events.filter((e) => e.kind === 'save-failed')).toHaveLength(1);
  });

  it('what the saved rows replay to is exactly what the live room holds', async () => {
    const people = [socket('u1', 'Ann'), socket('u2', 'Bea'), socket('u3', 'Cy')];
    let seed = 7;
    const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let i = 0; i < 300; i++) {
      await room.webSocketMessage(people[Math.floor(rand() * 3)], update(String.fromCharCode(97 + Math.floor(rand() * 26))));
      vi.advanceTimersByTime(Math.floor(rand() * 100));
    }
    await pass(2_000);
    const live = new Y.Doc();
    Y.applyUpdate(live, await room.state());
    expect(replay().getText('t').toString()).toBe(live.getText('t').toString());
    expect(Y.encodeStateVector(replay())).toEqual(Y.encodeStateVector(live));
    expect(rows()).toBeLessThan(300 / 4); // far fewer rows than edits
    expect((await room.record(false)).intact).toBe(true);
  });
});

describe('snapshots', () => {
  const type = async (n: number, who = socket('u1', 'Ann')) => {
    for (let i = 0; i < n; i++) {
      await room.webSocketMessage(who, update(String.fromCharCode(97 + (i % 26))));
      await pass(1_100); // a pause after every edit: one row per edit
    }
  };

  it('saves a snapshot every 200 rows once typing pauses', async () => {
    await type(210);
    expect(sql.exec('SELECT COUNT(*) AS n FROM snapshots').toArray()[0].n).toBe(1);
    expect(sql.exec('SELECT seq FROM snapshots').toArray()[0].seq).toBeGreaterThanOrEqual(200);
  });

  it('a woken room loads the snapshot plus the newer rows, not the whole history, and gets the same document', async () => {
    await type(230);
    const full = replay();
    sql.log.length = 0;
    const woken = new DocRoom(ctx as never, {} as never);
    const d = new Y.Doc();
    Y.applyUpdate(d, await woken.state());
    expect(d.getText('t').toString()).toBe(full.getText('t').toString());
    expect(Y.encodeStateVector(d)).toEqual(Y.encodeStateVector(full));
    const reads = sql.log.filter((q) => q.includes('FROM updates') && q.includes('data'));
    expect(reads.every((q) => q.includes('seq >'))).toBe(true); // only the rows after the snapshot
  });

  it('only ever keeps the newest snapshot', async () => {
    await type(430);
    expect(sql.exec('SELECT COUNT(*) AS n FROM snapshots').toArray()[0].n).toBe(1);
  });

  it('falls back to replaying everything if a snapshot cannot be read', async () => {
    await type(60);
    sql.exec('INSERT INTO snapshots (seq, data) VALUES (999999, ?)', new Uint8Array([1, 2, 3, 4, 5]));
    const full = replay();
    const woken = new DocRoom(ctx as never, {} as never);
    const d = new Y.Doc();
    Y.applyUpdate(d, await woken.state());
    expect(d.getText('t').toString()).toBe(full.getText('t').toString());
  });

  it('does not snapshot while edits are still waiting to be saved', async () => {
    const ann = socket('u1', 'Ann');
    for (let i = 0; i < 205; i++) {
      await room.webSocketMessage(ann, update('x'));
      await pass(1_000); // saved one second later, but the next edit is already waiting
      await room.webSocketMessage(ann, update('y'));
    }
    const snaps = sql.exec('SELECT seq FROM snapshots').toArray();
    // whatever was snapshotted must match the rows up to that point exactly
    for (const s of snaps) {
      const d = new Y.Doc();
      for (const r of sql.exec('SELECT data FROM updates WHERE seq <= ? ORDER BY seq', s.seq as number).toArray()) Y.applyUpdate(d, new Uint8Array(r.data as ArrayBuffer));
      const snap = sql.exec('SELECT data FROM snapshots WHERE seq = ?', s.seq as number).toArray()[0].data as ArrayBuffer;
      const sd = new Y.Doc();
      Y.applyUpdate(sd, new Uint8Array(snap));
      expect(sd.getText('t').toString()).toBe(d.getText('t').toString());
    }
  });
});

describe('the running summary', () => {
  it('matches what summarising the whole record gives, for random histories', async () => {
    for (const seed0 of [1, 2, 3, 4, 5]) {
      ctx = newContext();
      sql = ctx.storage.sql;
      room = new DocRoom(ctx as never, {} as never);
      sockets.clear();
      let seed = seed0 * 9973;
      const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
      const people = [socket('u1', 'Ann'), socket('u2', 'Bea'), socket('u3', 'Cy')];
      vi.setSystemTime(1_700_000_000_000);
      for (let i = 0; i < 120; i++) {
        const who = people[Math.floor(rand() * 3)];
        const r = rand();
        if (r < 0.6) await room.webSocketMessage(who, update('x'.repeat(1 + Math.floor(rand() * 8))));
        else if (r < 0.75) await room.webSocketMessage(who, update('y'.repeat(41 + Math.floor(rand() * 30)))); // a large edit
        else if (r < 0.9) await room.webSocketMessage(who, update('offline '.repeat(Math.floor(rand() * 6) + 1), 'step2'));
        else await room.addEvents({ id: ['u1', 'u2', 'u3'][Math.floor(rand() * 3)], name: 'p' }, [{ t: Date.now(), k: ['paste-blocked', 'away', 'back', 'round-off', 'roundmode-off'][Math.floor(rand() * 5)] }]);
        await pass(Math.floor(rand() * 2_500) + 50);
        if (i === 60) await room.summary(); // asked part way through, then again at the end
      }
      const fast = await room.summary();
      const slow = summarizeRecord(await room.record(false));
      expect(fast).toEqual(slow);
    }
  });

  it('is empty for a doc with nothing saved', async () => {
    expect(await room.summary()).toEqual(summarizeRecord({ updates: [], events: [], intact: true, seal: null }));
  });

  it('only reads rows it has not seen before', async () => {
    const ann = socket('u1', 'Ann');
    for (let i = 0; i < 20; i++) {
      await room.webSocketMessage(ann, update('a'));
      await pass(1_100);
    }
    await room.summary();
    sql.log.length = 0;
    await room.summary();
    expect(sql.log.filter((q) => q.includes('FROM updates')).every((q) => q.includes('seq >'))).toBe(true);
    await room.webSocketMessage(ann, update('more'));
    const s = await room.summary();
    expect(s.typedLive).toBe(24);
  });

  it('notices if the chain of saved rows has been tampered with', async () => {
    const ann = socket('u1', 'Ann');
    for (let i = 0; i < 3; i++) {
      await room.webSocketMessage(ann, update('a'));
      await pass(1_100);
    }
    sql.exec("UPDATE updates SET user = 'Someone else' WHERE seq = 2");
    const s = await room.summary();
    expect(s.intact).toBe(false);
    expect(s.flags).toBeGreaterThanOrEqual(1);
  });
});

describe('history since a point', () => {
  it('returns only the rows after the given number', async () => {
    const ann = socket('u1', 'Ann');
    for (let i = 0; i < 5; i++) {
      await room.webSocketMessage(ann, update('a'));
      await pass(1_100);
    }
    expect((await room.log()).map((r) => r.seq)).toEqual([1, 2, 3, 4, 5]);
    expect((await room.log(3)).map((r) => r.seq)).toEqual([4, 5]);
    expect(await room.log(5)).toEqual([]);
  });
});
