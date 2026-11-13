// Two people in one round flow, in real browsers, against a local server. Run before every deploy:
//
//   npm run build && npx wrangler dev --port 8793 --var DEV_LOGIN:1     (in one terminal)
//   npm run e2e                                                        (in another; BASE=http://127.0.0.1:8793)
//
// Checks: partners see each other's typing, caret and selected text; paste into a cell and into a sheet name is blocked; text
// pasted before the round cannot come back with Redo; the server's record has the typed text, cell by cell, with
// nothing flagged; the check page shows it. Exits non-zero on the first failure.
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

// Playwright is not a dependency of the app: the cloud sessions have it installed globally (found through NODE_PATH,
// which only require() reads); elsewhere run `npm i -D playwright` and `npx playwright install chromium` first.
const { chromium } = createRequire(import.meta.url)('playwright');

const BASE = process.env.BASE ?? 'http://127.0.0.1:8793';
const fails = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
  if (!ok) fails.push(name);
};

const browser = await chromium.launch();
try {
  const n = Date.now() % 100000;
  const open = async (name) => {
    const context = await browser.newContext({ viewport: { width: 1500, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    page.on('pageerror', (e) => fails.push(`${name} page error: ${e.message}`));
    await page.addInitScript(() => localStorage.setItem('pp-tour-seen', '1'));
    await page.goto(`${BASE}/api/auth/dev?name=${name}${n}`);
    await page.waitForLoadState('networkidle');
    return page;
  };
  const ann = await open('Ann');
  const bea = await open('Bea');
  const api = (p, path, method = 'GET', body) =>
    p.evaluate(
      async ([path, method, body]) => (await fetch(path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })).json(),
      [path, method, body],
    );

  // A team, a partner, and a flow doc shared between them (a prep flow first: Round doc is switched on later).
  const team = (await api(ann, '/api/teams', 'POST', { name: 'E2E team' })).id;
  await api(bea, '/api/join', 'POST', { code: (await api(ann, `/api/teams/${team}`)).invites.student });
  const beaId = (await api(bea, '/api/me')).user.id;
  const doc = randomUUID();
  await api(ann, '/api/docs', 'POST', { id: doc, teamId: team, title: 'E2E flow', kind: 'prep', format: 'flow', partners: [beaId] });
  await api(bea, `/api/docs/${doc}/respond`, 'POST', { accept: true });
  for (const p of [ann, bea]) {
    await p.evaluate((t) => localStorage.setItem('pp-space-v1', t), team);
    await p.reload();
    await p.waitForLoadState('networkidle');
    await p.locator('.doc-row', { hasText: 'E2E flow' }).locator('button').first().click();
    await p.locator('.f2-workspace').waitFor();
  }
  const A = ann.locator('.pane', { has: ann.locator('.f2-workspace') }).first();
  const B = bea.locator('.pane', { has: bea.locator('.f2-workspace') }).first();
  const values = (pane) => pane.locator('.f2-cell textarea').evaluateAll((els) => els.map((e) => e.value));
  const until = async (fn, ms = 5000) => {
    const end = Date.now() + ms;
    for (;;) {
      if (await fn()) return true;
      if (Date.now() > end) return false;
      await new Promise((r) => setTimeout(r, 100));
    }
  };

  // Before the round: Ann pastes prep, then undoes it.
  await A.locator('.f2-canvas').first().click({ position: { x: 60, y: 5 } });
  await ann.evaluate(() => navigator.clipboard.writeText('PREPPED BEFORE THE ROUND'));
  await ann.keyboard.press('Control+v');
  check('paste works in a prep flow', await until(async () => (await values(A)).some((v) => v.includes('PREPPED'))));
  await ann.keyboard.press('Control+z');
  check('undo removes it', await until(async () => !(await values(A)).some((v) => v.includes('PREPPED'))));

  // The round starts.
  await A.getByText('Round doc').click();
  await ann.waitForTimeout(800);
  // (Undo also took back the new cell the paste went into, so start one.)
  if (await A.locator('.f2-cell textarea').count()) await A.locator('.f2-cell textarea').first().click();
  else await A.locator('.f2-canvas').first().click({ position: { x: 60, y: 5 } });
  await ann.keyboard.press('Control+Shift+z');
  await ann.waitForTimeout(400);
  check('redo cannot bring pre-round paste back', !(await values(A)).some((v) => v.includes('PREPPED')));

  // Typing, both ways, and the caret.
  await A.locator('.f2-cell textarea').first().click();
  await ann.keyboard.press('Control+a');
  await ann.keyboard.type('Econ bad is real');
  await ann.keyboard.press('Tab');
  await ann.keyboard.type('No link');
  check('Bea sees Ann typing', await until(async () => (await values(B)).join('|').includes('Econ bad is real|No link')));
  await ann.keyboard.press('Home');
  check('Bea sees Ann’s caret in the cell', await until(async () => (await B.locator('.f2-peer-caret').count()) > 0));
  await ann.keyboard.press('Shift+End');
  check('Bea sees the text Ann selected', await until(async () => (await B.locator('.f2-peer-sel').count()) > 0));
  await ann.keyboard.press('Home');
  check('the selection band goes when Ann clicks away from it', await until(async () => (await B.locator('.f2-peer-sel').count()) === 0));

  // Paste into a cell and into a sheet name, in the round.
  await ann.evaluate(() => navigator.clipboard.writeText('PASTED IN ROUND'));
  await ann.keyboard.press('Control+v');
  await ann.waitForTimeout(300);
  check('paste into a cell is blocked', !(await values(A)).some((v) => v.includes('PASTED IN ROUND')));
  await A.locator('.f2-window-name').first().dblclick();
  await ann.keyboard.press('Control+a');
  await ann.keyboard.press('Control+v');
  const nameNow = await A.locator('.sheet-rename').inputValue().catch(() => '');
  check('paste into a sheet name is blocked', !nameNow.includes('PASTED'), nameNow);
  await ann.keyboard.press('Escape');

  // Bea answers.
  await B.locator('.f2-cell textarea').nth(1).click();
  await bea.keyboard.press('Tab');
  await bea.keyboard.type('Turn: it helps');
  check('Ann sees Bea typing', await until(async () => (await values(A)).some((v) => v === 'Turn: it helps')));

  // The server's record.
  await ann.waitForTimeout(2500);
  const rec = await api(ann, `/api/docs/${doc}/record`);
  const ups = rec.updates ?? [];
  const typed = ups.map((u) => u.text ?? '').join('');
  check('record is intact', rec.intact === true);
  check('record has Ann’s cells on their own lines', typed.includes('Econ bad is real') && /\nNo link/.test(typed));
  check('record has Bea’s text under her name', ups.some((u) => u.name.startsWith('Bea') && (u.text ?? '').includes('Turn')));
  check('no pasted text in the record', !typed.includes('PASTED IN ROUND'));
  const live = ups.filter((u) => u.via === 'live' && u.inserted > 40 && !u.restored);
  check('nothing flagged as a large edit', live.length === 0, `${live.length}`);
  const kinds = (rec.events ?? []).map((e) => e.kind);
  check('blocked paste is in the record', kinds.includes('paste-blocked'));
  const token = (await api(ann, `/api/docs?team=${team}`)).docs.find((d) => d.id === doc)?.checkToken;
  const html = token ? await ann.evaluate(async (t) => (await fetch(`/check/${t}`)).text(), token) : '';
  check('check page shows the typed text', html.includes('Econ bad is real'));
} catch (e) {
  fails.push(String(e?.message ?? e).split('\n')[0]);
  console.log('FAIL', fails.at(-1));
} finally {
  await browser.close();
}
if (fails.length) {
  console.log(`\n${fails.length} failed:\n- ${fails.join('\n- ')}`);
  process.exit(1);
}
console.log('\nall passed');
