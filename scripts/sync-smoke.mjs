// Smoke test for live sync: two clients edit one doc through the server.
// Usage: npx wrangler dev   (in another terminal), then
//        node scripts/sync-smoke.mjs http://localhost:8787
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';

const base = process.argv[2] ?? 'http://localhost:8787';
const wsBase = base.replace(/^http/, 'ws') + '/api/sync';
const room = 'smoke-' + Math.random().toString(36).slice(2, 10);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const synced = (p) => new Promise((r) => (p.synced ? r() : p.once('sync', r)));

const a = new Y.Doc();
const b = new Y.Doc();
const pa = new WebsocketProvider(wsBase, room, a, { params: { name: 'Alice', device: 'dev-a' } });
const pb = new WebsocketProvider(wsBase, room, b, { params: { name: 'Bob', device: 'dev-b' } });
await Promise.all([synced(pa), synced(pb)]);

a.getText('t').insert(0, 'Hello from Alice. ');
await wait(300);
b.getText('t').insert(b.getText('t').length, 'Hi from Bob.');
await wait(500);
console.log('A sees:', JSON.stringify(a.getText('t').toString()));
console.log('B sees:', JSON.stringify(b.getText('t').toString()));

// A third client joining later gets the saved document.
pa.destroy();
pb.destroy();
await wait(300);
const c = new Y.Doc();
const pc = new WebsocketProvider(wsBase, room, c, { params: { name: 'Coach', device: 'dev-c' } });
await synced(pc);
await wait(200);
console.log('Late joiner sees:', JSON.stringify(c.getText('t').toString()));
pc.destroy();

const hist = await (await fetch(`${base}/api/sync/${room}/history`)).json();
console.log('Server record:', hist.updates.map((u) => `${u.seq} ${u.user} ${u.bytes}B`).join(' | '));
const ok = a.getText('t').toString() === b.getText('t').toString() && c.getText('t').toString() === a.getText('t').toString();
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
