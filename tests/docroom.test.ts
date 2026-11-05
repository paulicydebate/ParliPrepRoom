// @vitest-environment node
import * as encoding from 'lib0/encoding';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';
import { beforeEach, describe, expect, it } from 'vitest';
import { newContext, type FakeSql } from './stubs/cloudflare-workers';
import { DocRoom } from '../worker/docRoom';

// The live-sync room: saving edits, and how much work small messages cause.

type Ctx = ReturnType<typeof newContext>;
let ctx: Ctx;
let sql: FakeSql;
let room: DocRoom;
const sent: Uint8Array[] = [];
const ws = {
  deserializeAttachment: () => ({ id: 'u1', name: 'Ann' }),
  serializeAttachment: () => {},
  send: (m: Uint8Array) => void sent.push(m),
  close: () => {},
} as unknown as WebSocket;

beforeEach(() => {
  ctx = newContext();
  sql = ctx.storage.sql;
  room = new DocRoom(ctx as never, {} as never);
  sent.length = 0;
});

/** A sync message carrying one typed edit, as a client would send it. */
function edit(text: string): ArrayBuffer {
  const doc = new Y.Doc();
  let update: Uint8Array = new Uint8Array();
  doc.on('update', (u: Uint8Array) => (update = u));
  doc.getText('t').insert(0, text);
  const enc = encoding.createEncoder();
  encoding.writeVarUint(enc, 0);
  syncProtocol.writeUpdate(enc, update);
  const b = encoding.toUint8Array(enc);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

const rows = () => sql.exec('SELECT COUNT(*) AS n FROM updates').toArray()[0].n as number;
const message = (type: number, ...rest: number[]) => new Uint8Array([type, ...rest]).buffer as ArrayBuffer;

describe('saving edits', () => {
  // (Edits from one person within a second are saved together as one row; see docroom-batching.test.ts.
  // `room.state()` saves anything waiting, so these tests ask for it between steps.)
  it('saves what is typed, and saves it by the time the state is asked for', async () => {
    await room.webSocketMessage(ws, edit('hello'));
    await room.webSocketMessage(ws, edit('world'));
    await room.state();
    expect(rows()).toBe(1); // both edits were from the same person within the second
    const d = new Y.Doc();
    Y.applyUpdate(d, await room.state());
    expect(d.getText('t').toString().length).toBe(10);
  });

  it('one failed save does not stop later saves, and the failure is recorded', async () => {
    await room.webSocketMessage(ws, edit('one'));
    await room.state();
    sql.failWhen = (q) => q.includes('INSERT INTO updates');
    await room.webSocketMessage(ws, edit('lost'));
    await room.state();
    sql.failWhen = null;
    await room.webSocketMessage(ws, edit('three'));
    await room.state();
    expect(rows()).toBe(2); // 'one' and 'three'; 'lost' could not be saved
    const events = sql.exec("SELECT kind FROM events WHERE kind = 'save-failed'").toArray();
    expect(events).toHaveLength(1);
    const record = await room.record(false);
    expect(record.intact).toBe(true);
    expect(record.events.filter((e) => e.kind === 'save-failed')).toHaveLength(1);
  });

  it('still reports a failed save when even the note about it cannot be stored', async () => {
    sql.failWhen = (q) => q.includes('INSERT INTO updates') || q.includes('INSERT INTO events');
    await room.webSocketMessage(ws, edit('lost'));
    await room.state();
    sql.failWhen = null;
    const record = await room.record(false);
    expect(record.events.filter((e) => e.kind === 'save-failed')).toHaveLength(1);
  });
});

describe('small messages', () => {
  it('cursor updates and keep-alives do not reload the document history', async () => {
    await room.webSocketMessage(ws, edit('some typing'));
    await room.state();
    // A new room object is what a woken-up (hibernated) room looks like.
    const woken = new DocRoom({ ...ctx } as never, {} as never);
    sql.log.length = 0;
    await woken.webSocketMessage(ws, message(1, 0)); // awareness (cursor)
    await woken.webSocketMessage(ws, message(99, 1)); // keep-alive ping
    expect(sql.log.filter((q) => q.includes('SELECT data FROM updates'))).toEqual([]);
    expect(sent.at(-1)).toEqual(new Uint8Array([99, 1])); // the ping was still answered
  });

  it('a typed edit after waking still loads the history first', async () => {
    await room.webSocketMessage(ws, edit('before'));
    await room.state();
    const woken = new DocRoom({ ...ctx } as never, {} as never);
    sql.log.length = 0;
    await woken.webSocketMessage(ws, edit('after'));
    await woken.state();
    expect(sql.log.some((q) => q.includes('SELECT data FROM updates'))).toBe(true);
    expect(rows()).toBe(2);
  });
});

describe('keep-alive', () => {
  it('asks the edge to answer "ping" with "pong" without waking the room', () => {
    class Pair {
      constructor(public request: string, public response: string) {}
    }
    (globalThis as unknown as { WebSocketRequestResponsePair: unknown }).WebSocketRequestResponsePair = Pair;
    const c = newContext();
    new DocRoom(c as never, {} as never);
    expect(c.autoResponses).toEqual([new Pair('ping', 'pong')]);
    delete (globalThis as unknown as { WebSocketRequestResponsePair?: unknown }).WebSocketRequestResponsePair;
  });
});

describe('saved-edits table without the extra counter', () => {
  const OLD_UPDATES = `CREATE TABLE updates (seq INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, user_id TEXT NOT NULL, user TEXT NOT NULL, via TEXT NOT NULL, data BLOB NOT NULL, prev TEXT NOT NULL, hash TEXT NOT NULL)`;
  const OLD_EVENTS = `CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, client_at INTEGER NOT NULL, user_id TEXT NOT NULL, user TEXT NOT NULL, kind TEXT NOT NULL, n INTEGER)`;
  const layout = (c: ReturnType<typeof newContext>, table: string) => String(c.storage.sql.exec('SELECT sql FROM sqlite_master WHERE name = ?', table).toArray()[0].sql);

  it('new rooms are made without it', () => {
    const c = newContext();
    new DocRoom(c as never, {} as never);
    expect(layout(c, 'updates')).not.toContain('AUTOINCREMENT');
    expect(layout(c, 'events')).not.toContain('AUTOINCREMENT');
  });

  it('existing rooms are converted, keeping every row, in order, and numbering carries on', async () => {
    const c = newContext();
    c.storage.sql.exec(OLD_UPDATES);
    c.storage.sql.exec(OLD_EVENTS);
    const doc = new Y.Doc();
    const updates: Uint8Array[] = [];
    doc.on('update', (u: Uint8Array) => updates.push(u));
    for (const ch of ['a', 'b', 'c']) doc.getText('t').insert(doc.getText('t').length, ch);
    updates.forEach((u, i) => c.storage.sql.exec('INSERT INTO updates (at, user_id, user, via, data, prev, hash) VALUES (?, ?, ?, ?, ?, ?, ?)', 1000 + i, 'u1', 'Ann', 'live', u, `p${i}`, `h${i}`));
    c.storage.sql.exec("INSERT INTO events (at, client_at, user_id, user, kind, n) VALUES (5, 5, 'u1', 'Ann', 'away', NULL)");
    const room = new DocRoom(c as never, {} as never);
    expect(layout(c, 'updates')).not.toContain('AUTOINCREMENT');
    expect(layout(c, 'events')).not.toContain('AUTOINCREMENT');
    expect(c.storage.sql.exec('SELECT seq, at, user, hash FROM updates ORDER BY seq').toArray()).toEqual([
      { seq: 1, at: 1000, user: 'Ann', hash: 'h0' },
      { seq: 2, at: 1001, user: 'Ann', hash: 'h1' },
      { seq: 3, at: 1002, user: 'Ann', hash: 'h2' },
    ]);
    expect(c.storage.sql.exec('SELECT kind FROM events').toArray()).toEqual([{ kind: 'away' }]);
    await room.webSocketMessage(ws, edit('new'));
    await room.state();
    expect(c.storage.sql.exec('SELECT MAX(seq) AS m FROM updates').toArray()[0].m).toBe(4);
  });

  it('is left alone once converted (no repeated copying)', () => {
    const c = newContext();
    new DocRoom(c as never, {} as never);
    c.storage.sql.log.length = 0;
    new DocRoom(c as never, {} as never);
    expect(c.storage.sql.log.some((q) => q.includes('INSERT INTO updates_new') || q.includes('DROP TABLE'))).toBe(false);
  });
});
