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
  it('saves each edit as a row', async () => {
    await room.webSocketMessage(ws, edit('hello'));
    await room.webSocketMessage(ws, edit('world'));
    expect(rows()).toBe(2);
  });

  it('one failed save does not stop later saves, and the failure is recorded', async () => {
    await room.webSocketMessage(ws, edit('one'));
    sql.failWhen = (q) => q.includes('INSERT INTO updates');
    await room.webSocketMessage(ws, edit('lost'));
    sql.failWhen = null;
    await room.webSocketMessage(ws, edit('three'));
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
    sql.failWhen = null;
    const record = await room.record(false);
    expect(record.events.filter((e) => e.kind === 'save-failed')).toHaveLength(1);
  });
});

describe('small messages', () => {
  it('cursor updates and keep-alives do not reload the document history', async () => {
    await room.webSocketMessage(ws, edit('some typing'));
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
    const woken = new DocRoom({ ...ctx } as never, {} as never);
    sql.log.length = 0;
    await woken.webSocketMessage(ws, edit('after'));
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
