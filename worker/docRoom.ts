import { DurableObject } from 'cloudflare:workers';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';

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

interface Who {
  name: string;
  device: string;
}

const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');

export class DocRoom extends DurableObject {
  private doc: Y.Doc | null = null;
  private lastHash = '0'.repeat(64);
  private writes: Promise<void> = Promise.resolve();

  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS updates (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        at INTEGER NOT NULL,
        user TEXT NOT NULL,
        device TEXT NOT NULL,
        data BLOB NOT NULL,
        prev TEXT NOT NULL,
        hash TEXT NOT NULL
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
    const who: Who = (ws?.deserializeAttachment() as Who | null) ?? { name: 'server', device: '' };
    const at = Date.now();
    this.writes = this.writes.then(async () => {
      const prev = this.lastHash;
      const head = new TextEncoder().encode(`${prev}|${at}|${who.name}|${who.device}|`);
      const buf = new Uint8Array(head.length + update.length);
      buf.set(head);
      buf.set(update, head.length);
      const hash = hex(await crypto.subtle.digest('SHA-256', buf));
      this.ctx.storage.sql.exec(
        'INSERT INTO updates (at, user, device, data, prev, hash) VALUES (?, ?, ?, ?, ?, ?)',
        at,
        who.name,
        who.device,
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
    if (url.pathname.endsWith('/history')) return this.history();
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server);
    const who: Who = {
      name: (url.searchParams.get('name') ?? 'Unnamed').slice(0, 80),
      device: (url.searchParams.get('device') ?? '').slice(0, 40),
    };
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
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MSG_SYNC);
      syncProtocol.readSyncMessage(dec, enc, doc, ws);
      if (encoding.length(enc) > 1) ws.send(encoding.toUint8Array(enc));
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

  /** The saved edit record (no document contents): who, when, size, hash chain. */
  private async history(): Promise<Response> {
    await this.writes;
    const rows = this.ctx.storage.sql
      .exec('SELECT seq, at, user, device, length(data) AS bytes, prev, hash FROM updates ORDER BY seq')
      .toArray();
    return Response.json({ updates: rows });
  }
}
