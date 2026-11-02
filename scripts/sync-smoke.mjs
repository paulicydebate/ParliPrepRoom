// Smoke test for live sync, sign-in and access rules against a local server.
// Usage: npx wrangler dev --var DEV_LOGIN:1   (in another terminal), then
//        node scripts/sync-smoke.mjs http://localhost:8787
import WebSocket from 'ws';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';

const base = process.argv[2] ?? 'http://localhost:8787';
const wsBase = base.replace(/^http/, 'ws') + '/api/sync';
const docId = 'smoke-' + crypto.randomUUID().slice(0, 18);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const synced = (p) => new Promise((r) => (p.synced ? r() : p.once('sync', r)));

/** Test sign-in (only works when the server runs with DEV_LOGIN). Returns the session cookie. */
async function signIn(name) {
  const res = await fetch(`${base}/api/auth/dev?name=${encodeURIComponent(name)}`, { redirect: 'manual' });
  const cookie = res.headers.get('set-cookie')?.split(';')[0];
  if (!cookie) throw new Error('Test sign-in failed: start the server with --var DEV_LOGIN:1');
  return cookie;
}
const api = (cookie, path, init = {}) =>
  fetch(base + path, { ...init, headers: { cookie, 'content-type': 'application/json', ...(init.headers ?? {}) } });

/** A WebSocket that sends the session cookie, like a browser on the same site does. */
const withCookie = (cookie) =>
  class extends WebSocket {
    constructor(url, protocols) {
      super(url, protocols, { headers: { cookie } });
    }
  };

const alice = await signIn('Smoke Alice');
const bob = await signIn('Smoke Bob');
const team = await (await api(alice, '/api/teams', { method: 'POST', body: JSON.stringify({ name: 'Smoke team' }) })).json();
const details = await (await api(alice, `/api/teams/${team.id}`)).json();
await api(bob, '/api/join', { method: 'POST', body: JSON.stringify({ code: details.invites.student }) });
await api(alice, '/api/docs', { method: 'POST', body: JSON.stringify({ id: docId, teamId: team.id, title: 'Smoke doc', kind: 'prep' }) });

const a = new Y.Doc();
const b = new Y.Doc();
const pa = new WebsocketProvider(wsBase, docId, a, { WebSocketPolyfill: withCookie(alice) });
const pb = new WebsocketProvider(wsBase, docId, b, { WebSocketPolyfill: withCookie(bob) });
await Promise.all([synced(pa), synced(pb)]);
a.getText('t').insert(0, 'Hello from Alice. ');
await wait(300);
b.getText('t').insert(b.getText('t').length, 'Hi from Bob.');
await wait(500);
console.log('A sees:', JSON.stringify(a.getText('t').toString()));
console.log('B sees:', JSON.stringify(b.getText('t').toString()));
pa.destroy();
pb.destroy();

const anon = await fetch(`${base}/api/sync/${docId}`);
console.log('Not signed in gets:', anon.status);
const record = await (await api(alice, `/api/docs/${docId}/record`)).json();
console.log('Server record:', record.updates.map((u) => `${u.name} +${u.inserted}`).join(' | '), '| intact:', record.intact);
const ok = a.getText('t').toString() === b.getText('t').toString() && anon.status === 401 && record.intact;
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
