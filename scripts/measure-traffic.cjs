// Measures what one pair of students costs the server, in real browsers.
// Needs Playwright, and a local server started with:
//   npx wrangler dev --port 8793 --ip 127.0.0.1 --var DEV_LOGIN:1
// Run:  node scripts/measure-traffic.cjs
// Prints WebSocket messages per typed character, and what an idle open doc
// costs per minute (messages and HTTP requests). Use it before and after any
// change that is meant to reduce server traffic (see EFFICIENCY.md).
const { chromium } = require('playwright');


const BASE = 'http://127.0.0.1:8793';
const kindOf = (b) => (b[0] === 1 ? 'awareness' : b[0] === 0 ? 'sync-' + (['step1', 'step2', 'update'][b[1]] ?? b[1]) : b[0] === 99 ? 'keepalive' : 'type' + b[0]);

(async () => {
  const n = Date.now() % 100000;
  const browser = await chromium.launch();
  const open = async (name) => {
    const context = await browser.newContext({ viewport: { width: 1300, height: 800 } });
    const page = await context.newPage();
    await page.addInitScript(() => localStorage.setItem('pp-tour-seen', '1'));
    await page.goto(`${BASE}/api/auth/dev?name=${name}${n}`);
    await page.waitForTimeout(2500);
    return page;
  };
  const [ann, bea] = [await open('Ann'), await open('Bea')];
  const api = (p, path, method = 'GET', body) =>
    p.evaluate(async ([path, method, body]) => (await fetch(path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })).json(), [path, method, body]);
  const team = (await api(ann, '/api/teams', 'POST', { name: 'Measure' })).id;
  await api(bea, '/api/join', 'POST', { code: (await api(ann, '/api/teams/' + team)).invites.student });
  const doc = crypto.randomUUID();
  await api(ann, '/api/docs', 'POST', { id: doc, teamId: team, title: 'MeasureDoc', kind: 'prep', round: true, partners: [(await api(bea, '/api/me')).user.id] });
  await api(bea, `/api/docs/${doc}/respond`, 'POST', { accept: true });

  const stats = { ann: { sent: {}, recv: {}, http: 0 }, bea: { sent: {}, recv: {}, http: 0 } };
  const watch = (page, who) => {
    page.on('request', (r) => r.url().includes('/api/') && stats[who].http++);
    page.on('websocket', (ws) => {
      ws.on('framesent', (f) => { const k = kindOf(Buffer.from(f.payload)); stats[who].sent[k] = (stats[who].sent[k] || 0) + 1; });
      ws.on('framereceived', (f) => { const k = kindOf(Buffer.from(f.payload)); stats[who].recv[k] = (stats[who].recv[k] || 0) + 1; });
    });
  };
  watch(ann, 'ann'); watch(bea, 'bea');
  for (const p of [ann, bea]) {
    await p.evaluate((t) => localStorage.setItem('pp-space-v1', t), team);
    await p.reload(); await p.waitForTimeout(3500);
    await p.locator('.doc-row', { hasText: 'MeasureDoc' }).locator('button').first().click(); await p.waitForTimeout(2000);
  }
  const pane = await ann.evaluate(() => [...document.querySelectorAll('.pane')].findIndex((pn) => pn.querySelector('.pane-head input')?.value === 'MeasureDoc'));
  await ann.locator('.pane').nth(pane).locator('.pp-doc').click();
  const reset = () => { for (const w of ['ann', 'bea']) stats[w] = { sent: {}, recv: {}, http: 0 }; };
  const total = (o) => Object.values(o).reduce((a, b) => a + b, 0);

  reset();
  const CHARS = 200;
  await ann.keyboard.type('x'.repeat(CHARS), { delay: 200 }); // 5 characters a second
  await ann.waitForTimeout(1500);
  const toServer = total(stats.ann.sent) + total(stats.bea.sent);
  console.log(`TYPING ${CHARS} characters (Ann types, Bea only watches)`);
  console.log('  messages sent TO the server, per character:', (toServer / CHARS).toFixed(2), '| by kind: Ann', JSON.stringify(stats.ann.sent), 'Bea', JSON.stringify(stats.bea.sent));
  console.log('  messages the server relays OUT, per character:', ((total(stats.ann.recv) + total(stats.bea.recv)) / CHARS).toFixed(2));

  reset();
  const SECS = 60;
  await ann.waitForTimeout(SECS * 1000);
  console.log(`IDLE ${SECS} s, both tabs visible, nobody typing`);
  console.log('  messages sent to the server per minute (both tabs):', total(stats.ann.sent) + total(stats.bea.sent), '| by kind:', JSON.stringify(stats.ann.sent));
  console.log('  HTTP requests per minute (both tabs):', stats.ann.http + stats.bea.http);
  await browser.close();
})();
