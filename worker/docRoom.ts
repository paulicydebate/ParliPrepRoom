import { DurableObject } from 'cloudflare:workers';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';
import { measureUpdate } from './measure';

export { measureUpdate };

// One live room per document (a Cloudflare Durable Object).
//
// - Speaks the y-websocket protocol, so browsers use the stock
//   WebsocketProvider.
// - Saves every update in its own SQLite table with the server's time and the
//   sender's name and device, chained by SHA-256 (each row's hash covers the
//   previous row's hash). This is the server-side edit record a student can't
//   rewrite from their own computer.
// - Uses WebSocket hibernation, so an idle room costs nothing; the document is
//   rebuilt from the saved updates when the room wakes up.

const MSG_SYNC = 0;
const MSG_AWARENESS = 1;
/** Not part of y-websocket: the app's connection check (echoed back). */
const MSG_PING = 99;

/** Who is on a connection. Set by the worker from the signed-in session. */
export interface Who {
  id: string;
  name: string;
}

/** One saved update, as shown on the check page. */
export interface RecordUpdate {
  seq: number;
  at: number;
  userId: string;
  name: string;
  /** 'live' = typed while connected; 'catchup' = sent after reconnecting (offline work, first upload). */
  via: string;
  inserted: number;
  deleted: number;
  /** Text inserted by this update (only returned to people with access to the doc). */
  text?: string;
  /** Text this update deleted (same access rule). */
  deletedText?: string;
}

/** Events reported by the app (blocked pastes, round doc on/off, time away...). */
export interface RecordEvent {
  at: number;
  clientAt: number;
  userId: string;
  name: string;
  kind: string;
  n: number | null;
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');

export class DocRoom extends DurableObject {
  private doc: Y.Doc | null = null;
  /** How the message being handled arrived (see RecordUpdate.via). */
  private via = 'live';
  private lastHash = '0'.repeat(64);
  private writes: Promise<void> = Promise.resolve();

  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS updates (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        at INTEGER NOT NULL,
        user_id TEXT NOT NULL,
        user TEXT NOT NULL,
        via TEXT NOT NULL,
        data BLOB NOT NULL,
        prev TEXT NOT NULL,
        hash TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        at INTEGER NOT NULL,
        client_at INTEGER NOT NULL,
        user_id TEXT NOT NULL,
        user TEXT NOT NULL,
        kind TEXT NOT NULL,
        n INTEGER
      )`);
      const last = this.ctx.storage.sql.exec('SELECT hash FROM updates ORDER BY seq DESC LIMIT 1').toArray()[0];
      if (last) this.lastHash = String(last.hash);
    });
  }

  private loadDoc(): Y.Doc {
    if (this.doc) return this.doc;
    const doc = new Y.Doc();
    for (const row of this.ctx.storage.sql.exec('SELECT data FROM updates ORDER BY seq')) {
      Y.applyUpdate(doc, new Uint8Array(row.data as ArrayBuffer));
    }
    doc.on('update', (update: Uint8Array, origin: unknown) => this.onUpdate(update, origin));
    this.doc = doc;
    return doc;
  }

  private onUpdate(update: Uint8Array, origin: unknown) {
    const ws = origin instanceof WebSocket ? origin : null;
    const who: Who = (ws?.deserializeAttachment() as Who | null) ?? { id: 'server', name: 'server' };
    const at = Date.now();
    const via = ws ? this.via : 'server';
    this.writes = this.writes.then(async () => {
      const prev = this.lastHash;
      const head = new TextEncoder().encode(`${prev}|${at}|${who.id}|${who.name}|${via}|`);
      const buf = new Uint8Array(head.length + update.length);
      buf.set(head);
      buf.set(update, head.length);
      const hash = hex(await crypto.subtle.digest('SHA-256', buf));
      this.ctx.storage.sql.exec(
        'INSERT INTO updates (at, user_id, user, via, data, prev, hash) VALUES (?, ?, ?, ?, ?, ?, ?)',
        at,
        who.id,
        who.name,
        via,
        update,
        prev,
        hash,
      );
      this.lastHash = hash;
    });
    // Pass the change on to everyone else in the room.
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MSG_SYNC);
    syncProtocol.writeUpdate(enc, update);
    const msg = encoding.toUint8Array(enc);
    for (const peer of this.ctx.getWebSockets()) if (peer !== ws) peer.send(msg);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    void url;
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
    // The worker only forwards signed-in people with access, and says who they are.
    const header = request.headers.get('x-pp-user');
    if (!header) return new Response('Not signed in', { status: 401 });
    const who = JSON.parse(header) as Who;

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(who);

    // Start the sync: send our state vector; the browser answers with what we lack.
    const doc = this.loadDoc();
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MSG_SYNC);
    syncProtocol.writeSyncStep1(enc, doc);
    server.send(encoding.toUint8Array(enc));
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string) {
    if (typeof message === 'string') return;
    const data = new Uint8Array(message);
    const doc = this.loadDoc();
    const dec = decoding.createDecoder(data);
    const type = decoding.readVarUint(dec);
    if (type === MSG_SYNC) {
      // Sync step 2 = catching up after (re)connecting; update = typed live.
      this.via = data[1] === syncProtocol.messageYjsSyncStep2 ? 'catchup' : 'live';
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MSG_SYNC);
      syncProtocol.readSyncMessage(dec, enc, doc, ws);
      this.via = 'live';
      if (encoding.length(enc) > 1) ws.send(encoding.toUint8Array(enc));
    } else if (type === MSG_PING) {
      // Connection check from the app: answered only after every earlier
      // message from this connection is saved, so the reply also means
      // "your edits so far are on the server".
      await this.writes;
      ws.send(data);
      return;
    } else if (type === MSG_AWARENESS) {
      // Cursors and names: relay as-is to the others.
      for (const peer of this.ctx.getWebSockets()) if (peer !== ws) peer.send(data);
    }
    await this.writes;
  }

  async webSocketClose(ws: WebSocket, code: number) {
    try {
      ws.close(code === 1005 ? 1000 : code, 'closing');
    } catch {
      // already closed
    }
  }

  async webSocketError(ws: WebSocket) {
    try {
      ws.close(1011, 'error');
    } catch {
      // already closed
    }
  }

  /** The document as it is now, or as it was after update number `seq`, as one Yjs update. */
  async state(seq?: number): Promise<Uint8Array> {
    await this.writes;
    if (seq === undefined) return Y.encodeStateAsUpdate(this.loadDoc());
    const doc = new Y.Doc();
    for (const row of this.ctx.storage.sql.exec('SELECT data FROM updates WHERE seq <= ? ORDER BY seq', seq)) {
      Y.applyUpdate(doc, new Uint8Array(row.data as ArrayBuffer));
    }
    return Y.encodeStateAsUpdate(doc);
  }

  /** Every saved update with who and when, for version history and replay in the app. */
  async log(): Promise<{ seq: number; at: number; userId: string; name: string; via: string; data: string }[]> {
    await this.writes;
    return this.ctx.storage.sql
      .exec('SELECT seq, at, user_id, user, via, data FROM updates ORDER BY seq')
      .toArray()
      .map((r) => ({
        seq: Number(r.seq),
        at: Number(r.at),
        userId: String(r.user_id),
        name: String(r.user),
        via: String(r.via),
        data: toBase64(new Uint8Array(r.data as ArrayBuffer)),
      }));
  }

  /** Erase this document's contents and record (account deletion). */
  async wipe(): Promise<void> {
    await this.writes;
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.close(1000, 'deleted');
      } catch {
        // ignore
      }
    }
    this.doc = null;
    await this.ctx.storage.deleteAll();
  }

  /** Save events the app reports (blocked pastes, round doc on/off, time away). */
  async addEvents(who: Who, events: { t: number; k: string; n?: number }[]): Promise<void> {
    const now = Date.now();
    for (const e of events.slice(0, 500)) {
      if (typeof e.k !== 'string' || e.k === 'type' || e.k === 'delete') continue; // typing itself comes from the updates
      this.ctx.storage.sql.exec(
        'INSERT INTO events (at, client_at, user_id, user, kind, n) VALUES (?, ?, ?, ?, ?, ?)',
        now, Number(e.t) || now, who.id, who.name, e.k.slice(0, 32), typeof e.n === 'number' ? e.n : null,
      );
    }
  }

  /**
   * The full server record: every saved update (who, when, how much) and the
   * reported events, plus whether the hash chain checks out.
   */
  async record(withText: boolean): Promise<{ updates: RecordUpdate[]; events: RecordEvent[]; intact: boolean; seal: string | null }> {
    await this.writes;
    const updates: RecordUpdate[] = [];
    let prev = '0'.repeat(64);
    let intact = true;
    const chars = new Map<string, string>();
    for (const row of this.ctx.storage.sql.exec('SELECT * FROM updates ORDER BY seq')) {
      const data = new Uint8Array(row.data as ArrayBuffer);
      const head = new TextEncoder().encode(`${row.prev}|${row.at}|${row.user_id}|${row.user}|${row.via}|`);
      const buf = new Uint8Array(head.length + data.length);
      buf.set(head);
      buf.set(data, head.length);
      if (row.prev !== prev || hex(await crypto.subtle.digest('SHA-256', buf)) !== row.hash) intact = false;
      prev = String(row.hash);
      const m = measureUpdate(data, chars);
      updates.push({
        seq: Number(row.seq),
        at: Number(row.at),
        userId: String(row.user_id),
        name: String(row.user),
        via: String(row.via),
        inserted: m.text.length,
        deleted: m.deletedText.length || m.deleted,
        ...(withText ? { text: m.text.slice(0, 2000), deletedText: m.deletedText.slice(0, 2000) } : {}),
      });
    }
    const events = this.ctx.storage.sql
      .exec('SELECT * FROM events ORDER BY id')
      .toArray()
      .map((r) => ({ at: Number(r.at), clientAt: Number(r.client_at), userId: String(r.user_id), name: String(r.user), kind: String(r.kind), n: r.n === null ? null : Number(r.n) }));
    const seal = updates.length ? `${prev.slice(0, 4)}-${prev.slice(4, 8)}`.toUpperCase() : null;
    return { updates, events, intact, seal };
  }
}
