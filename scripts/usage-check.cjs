// Reads this month's Cloudflare usage for the account and warns when any number passes
// a share of the monthly allowance on the Workers Paid plan (limits from memory: check the dashboard).
// Run:  NODE_USE_ENV_PROXY=1 CLOUDFLARE_API_TOKEN=... node scripts/usage-check.cjs [warnPercent=50]   (NODE_USE_ENV_PROXY only inside the cloud sandbox)
// Exit code 1 when something is over the warning line. Needs only analytics read access.
const TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID || 'cc1fffd57d89d16d2e28ed38e9a58cc1';
const WARN = Number(process.argv[2] || 50);

// Included monthly allowances on Workers Paid (from memory; update if Cloudflare changes them).
const LIMITS = {
  'Worker requests': 10_000_000,
  'Durable Object requests': 1_000_000,
  'Database rows written': 50_000_000,
  'Database rows read': 25_000_000_000,
  'WebSocket messages (billed 20 to 1)': 20_000_000, // counted as DO requests at 20:1 (1M requests x 20)
};

const now = new Date();
const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
const to = now.toISOString();
const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();

async function gql(query) {
  const r = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const j = await r.json();
  if (j.errors?.length) throw new Error(j.errors.map((e) => e.message).join('; '));
  return j.data.viewer.accounts[0];
}

const range = (a, b) => `{ datetime_geq: "${a}", datetime_leq: "${b}" }`;
const q = (a, b) => `{ viewer { accounts(filter: { accountTag: "${ACCOUNT}" }) {
  w: workersInvocationsAdaptive(limit: 1000, filter: ${range(a, b)}) { sum { requests } }
  d: durableObjectsInvocationsAdaptiveGroups(limit: 1000, filter: ${range(a, b)}) { sum { requests } }
  p: durableObjectsPeriodicGroups(limit: 1000, filter: ${range(a, b)}) { sum { rowsRead rowsWritten } }
} } }`;
const total = (rows, k) => (rows || []).reduce((s, r) => s + (r.sum?.[k] || 0), 0);

(async () => {
  if (!TOKEN) throw new Error('Set CLOUDFLARE_API_TOKEN');
  const [month, day] = [await gql(q(from, to)), await gql(q(today, to))];
  const rows = [
    ['Worker requests', total(month.w, 'requests'), total(day.w, 'requests')],
    ['Durable Object requests', total(month.d, 'requests'), total(day.d, 'requests')],
    ['Database rows written', total(month.p, 'rowsWritten'), total(day.p, 'rowsWritten')],
    ['Database rows read', total(month.p, 'rowsRead'), total(day.p, 'rowsRead')],
  ];
  const monthFrac = now.getUTCDate() / new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  let over = false;
  console.log(`Cloudflare usage ${from.slice(0, 10)} to now (${(monthFrac * 100).toFixed(0)}% of the month gone); warning line ${WARN}% of the monthly allowance`);
  for (const [name, m, d] of rows) {
    const pct = (m / LIMITS[name]) * 100;
    const flag = pct >= WARN ? ' <== OVER THE WARNING LINE' : '';
    if (pct >= WARN) over = true;
    console.log(`  ${name}: ${m.toLocaleString()} this month (${pct.toFixed(2)}%), ${d.toLocaleString()} today${flag}`);
  }
  console.log(over ? 'WARNING: usage is high.' : 'OK: all well under the warning line.');
  process.exit(over ? 1 : 0);
})().catch((e) => {
  console.error('Could not read usage:', e.message);
  process.exit(2);
});
