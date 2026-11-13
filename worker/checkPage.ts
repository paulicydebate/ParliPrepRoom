import type { DocRecord } from './directory';
import type { RecordEvent, RecordUpdate } from './docRoom';
import { isStarting } from './summary';

// The public check page for a round doc: a self-contained HTML page (no app
// code) that an opponent, coach or tab room opens from a link or QR code.
// Everyone sees who typed, when, how much, flags and whether the server's
// record is intact. People on the doc (signed in) also see the text typed.

/** One live update that inserts more than this many characters is flagged. */
const LARGE = 40;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

// Times are shown in the viewer's time zone (from Cloudflare), set per request.
let timeZone = 'America/Los_Angeles';
function clock(ms: number) {
  return new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', timeZone });
}
function date(ms: number) {
  return new Date(ms).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone });
}
function zoneName() {
  return new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' }).formatToParts(new Date()).find((p) => p.type === 'timeZoneName')?.value ?? timeZone;
}
function minutes(ms: number) {
  return ms < 60_000 ? `${Math.round(ms / 1000)} s` : `${Math.round(ms / 60_000)} min`;
}

const EVENT_LABEL: Record<string, string> = {
  'paste-blocked': 'Tried to paste (blocked)',
  'drop-blocked': 'Tried to drag in text (blocked)',
  'round-on': 'Turned round doc on',
  'round-off': 'Turned round doc off',
  restore: 'Restored an earlier version',
  'roundmode-on': 'Started Round Mode (only round docs open)',
  'roundmode-off': 'Left Round Mode',
  away: 'Switched to another app or tab',
  back: 'Came back to the app',
  large: 'Large single edit (app report)',
};

interface Input {
  doc: DocRecord;
  team: string | null;
  owner: string;
  partners: string[];
  record: { updates: RecordUpdate[]; events: RecordEvent[]; intact: boolean; seal: string | null };
  withText: boolean;
  url: string;
  /** IANA time zone of the viewer. */
  tz?: string;
  /** Opened from the tournament director's link. */
  director?: boolean;
}

export function renderCheckPage({ doc, team, owner, partners, record, withText, url, tz, director }: Input): string {
  try {
    if (tz) new Intl.DateTimeFormat('en-US', { timeZone: tz });
    timeZone = tz || 'America/Los_Angeles';
  } catch {
    timeZone = 'America/Los_Angeles';
  }
  const live = record.updates.filter((u) => u.via === 'live');
  const firstSave = record.updates[0]?.at;
  const starting = record.updates.filter((u) => isStarting(u, firstSave));
  const catchup = record.updates.filter((u) => u.via !== 'live' && !isStarting(u, firstSave));
  const first = record.updates[0]?.at ?? null;
  const last = record.updates[record.updates.length - 1]?.at ?? null;

  // Per person.
  const people = new Map<string, { name: string; typed: number; deleted: number; edits: number }>();
  for (const u of record.updates) {
    const p = people.get(u.userId) ?? { name: u.name, typed: 0, deleted: 0, edits: 0 };
    p.typed += u.inserted;
    p.deleted += u.deleted;
    p.edits++;
    people.set(u.userId, p);
  }

  // Flags.
  const large = live.filter((u) => u.inserted > LARGE && !u.restored);
  const blocked = record.events.filter((e) => e.kind === 'paste-blocked' || e.kind === 'drop-blocked');
  const roundOff = record.events.filter((e) => e.kind === 'round-off');
  let awayMs = 0;
  const awaySince = new Map<string, number>();
  for (const e of record.events) {
    if (e.kind === 'away') awaySince.set(e.userId, e.at);
    if (e.kind === 'back' && awaySince.has(e.userId)) {
      awayMs += e.at - awaySince.get(e.userId)!;
      awaySince.delete(e.userId);
    }
  }

  // Characters typed per minute (live only), as a bar chart.
  let chart = '';
  if (first && last && live.length) {
    const buckets = Math.max(1, Math.min(120, Math.ceil((last - first) / 60_000) + 1));
    const per = new Array(buckets).fill(0);
    for (const u of live) per[Math.min(buckets - 1, Math.floor((u.at - first) / 60_000))] += u.inserted;
    const max = Math.max(...per, 1);
    const w = 600;
    const h = 90;
    const bw = w / buckets;
    chart = `<svg viewBox="0 0 ${w} ${h + 18}" role="img" aria-label="Characters typed per minute">
      ${per.map((v, i) => `<rect x="${(i * bw + 1).toFixed(1)}" y="${(h - (v / max) * h).toFixed(1)}" width="${Math.max(1, bw - 2).toFixed(1)}" height="${((v / max) * h).toFixed(1)}" rx="2" class="bar"><title>Minute ${i + 1}: ${v} characters</title></rect>`).join('')}
      <line x1="0" y1="${h}" x2="${w}" y2="${h}" class="axis"/>
      <text x="0" y="${h + 14}" class="tick">${esc(clock(first))}</text>
      <text x="${w}" y="${h + 14}" class="tick" text-anchor="end">${esc(clock(last))}</text>
    </svg>
    <p class="note">Busiest minute: ${max.toLocaleString()} characters. Steady typing is usually a few hundred characters a minute at most.</p>`;
  }

  // Timeline of things worth a look.
  const timeline = [
    ...large.map((u) => ({ at: u.at, who: u.name, what: `Put in ${u.inserted} characters in one edit`, warn: true, text: withText ? u.text ?? '' : '' })),
    ...record.events.map((e) => ({ at: e.at, who: e.name, what: EVENT_LABEL[e.kind] ?? e.kind, warn: e.kind.endsWith('-blocked') || e.kind === 'round-off' || e.kind === 'large', text: '' })),
    ...starting.filter((u) => u.inserted > 0).map((u) => ({ at: u.at, who: u.name, what: `Doc created with ${u.inserted} characters of starting text`, warn: false, text: '' })),
    ...catchup.filter((u) => u.inserted >= 20).map((u) => ({ at: u.at, who: u.name, what: `Synced ${u.inserted} characters typed while offline or before sharing`, warn: false, text: '' })),
  ].sort((a, b) => a.at - b.at);

  const verdict = record.intact
    ? `<div class="seal ok"><div><div class="label">Seal code</div><div class="code">${esc(record.seal ?? '—')}</div></div><p>The server's record is intact: every saved edit checks out against the one before it. This record is kept on the server, not on the student's device.</p></div>`
    : `<div class="seal bad"><div><div class="label">Seal code</div><div class="code">${esc(record.seal ?? '—')}</div></div><p>The record does not check out. Contact the team's coach.</p></div>`;

  const peopleRows = [...people.values()]
    .map((p) => `<tr><td>${esc(p.name)}</td><td class="num">${p.typed.toLocaleString()}</td><td class="num">${p.deleted.toLocaleString()}</td><td class="num">${p.edits.toLocaleString()}</td></tr>`)
    .join('');

  // Group keystrokes into bursts: same person, same kind, no pause over 4 s.
  // Each burst keeps typed and deleted text in order.
  interface Burst {
    start: number;
    end: number;
    name: string;
    via: string;
    large: boolean;
    parts: { kind: 'typed' | 'removed'; text: string }[];
  }
  const bursts: Burst[] = [];
  for (const u of record.updates) {
    const typed = u.text ?? '';
    const removed = u.deletedText ?? '';
    if (!typed && !removed) continue;
    const big = u.via === 'live' && u.inserted > LARGE && !u.restored;
    let last = bursts[bursts.length - 1];
    if (!(last && !big && !last.large && last.name === u.name && last.via === u.via && u.at - last.end < 4000)) {
      last = { start: u.at, end: u.at, name: u.name, via: u.via, large: big, parts: [] };
      bursts.push(last);
    }
    last.end = u.at;
    const add = (kind: 'typed' | 'removed', text: string) => {
      if (!text) return;
      const tail = last.parts[last.parts.length - 1];
      // Backspacing removes text right to left, so put it back in reading order.
      if (tail && tail.kind === kind) tail.text = kind === 'removed' ? text + tail.text : tail.text + text;
      else last.parts.push({ kind, text });
    };
    add('removed', removed);
    add('typed', typed);
  }
  const textSection = withText
    ? `<h2>Everything typed and deleted, in order</h2><p class="note">${director ? 'Shown to the tab room through the tournament director link.' : "You see this because you're on this doc."} People without access see the summary only. Grouped into bursts with no pause over 4 seconds. <ins>Typed</ins> <del>deleted</del></p>
       <ol class="typed">${bursts
         .filter((b) => b.parts.some((p) => p.text.trim()))
         .map(
           (b) =>
             `<li class="${b.via !== 'live' ? 'catchup' : b.large ? 'warn' : ''}"><span class="t">${esc(clock(b.start))}</span><span class="w">${esc(b.name)}</span><span class="x">${b.parts
               .map((p, i) => {
                 const t = i === 0 ? p.text.replace(/^\n+/, '') : p.text;
                 return p.kind === 'removed' ? `<del>${esc(t)}</del>` : `<ins>${esc(t)}</ins>`;
               })
               .join('')}</span></li>`,
         )
         .join('')}</ol>`
    : `<p class="note">The prep itself isn't shown here. Partners and coaches on this doc see the full text when signed in.</p>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<title>Round doc check · ${esc(doc.title)}</title>
<style>
  :root { --bg:#f6f5f2; --card:#fff; --text:#1d1f1e; --muted:#5c615e; --line:#e3e3de; --round:#7c3aed; --ok-bg:#dcf5e6; --ok:#135c33; --bad-bg:#fde4e1; --bad:#8f1d14; --warn:#c2410c; --bar:#7c3aed; color-scheme: light; }
  @media (prefers-color-scheme: dark) { :root { --bg:#111413; --card:#181c1b; --text:#e7ebe9; --muted:#a5ada9; --line:#2a302e; --round:#a77bff; --ok-bg:#163a26; --ok:#9be3b8; --bad-bg:#43201c; --bad:#f6b2a9; --warn:#fb923c; --bar:#a77bff; color-scheme: dark; } }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif; padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) 40px max(16px, env(safe-area-inset-left)); }
  main { max-width: 760px; margin: 0 auto; display:flex; flex-direction:column; gap:14px; }
  header { border:3px solid var(--round); border-radius:14px; background:var(--card); padding:14px 16px; }
  .eyebrow { font-size:12px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:var(--round); }
  h1 { margin:4px 0 2px; font-size:22px; line-height:1.25; text-wrap:balance; }
  h2 { font-size:13px; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); margin:10px 0 0; }
  .meta { color:var(--muted); margin:0; }
  .seal { display:flex; gap:16px; align-items:center; flex-wrap:wrap; padding:14px 16px; border-radius:12px; }
  .seal p { margin:0; flex:1 1 240px; }
  .seal.ok { background:var(--ok-bg); color:var(--ok); }
  .seal.bad { background:var(--bad-bg); color:var(--bad); }
  .label { font-size:11px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; }
  .code { font:700 24px/1.2 ui-monospace,Menlo,Consolas,monospace; letter-spacing:.04em; }
  .stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:10px; }
  .stat { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:10px 12px; }
  .stat dt { font-size:12px; color:var(--muted); }
  .stat dd { margin:2px 0 0; font-size:20px; font-weight:700; font-variant-numeric:tabular-nums; }
  .stat dd.warn { color:var(--warn); }
  .card { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:12px 14px; overflow-x:auto; }
  table { width:100%; border-collapse:collapse; }
  th, td { text-align:left; padding:6px 4px; border-bottom:1px solid var(--line); }
  th { font-size:12px; color:var(--muted); font-weight:600; }
  .num { text-align:right; font-variant-numeric:tabular-nums; }
  svg { width:100%; height:auto; display:block; }
  .bar { fill:var(--bar); }
  .axis { stroke:var(--line); }
  .tick { fill:var(--muted); font-size:11px; }
  .note { color:var(--muted); font-size:13px; margin:6px 0 0; }
  ul.events, ol.typed { list-style:none; margin:0; padding:0; }
  ul.events li, ol.typed li { display:flex; gap:10px; flex-wrap:wrap; padding:7px 0; border-bottom:1px solid var(--line); }
  .t { color:var(--muted); font-variant-numeric:tabular-nums; min-width:92px; }
  .w { font-weight:600; min-width:90px; }
  .warn .x, li.warn .what { color:var(--warn); font-weight:600; }
  .x { flex:1 1 240px; min-width:0; white-space:pre-wrap; word-break:break-word; }
  li.catchup .x { color:var(--muted); }
  ins { text-decoration:none; }
  del { color:var(--bad); background:var(--bad-bg); border-radius:3px; }
  footer { color:var(--muted); font-size:12.5px; }
  .deleted-note { display:inline-block; margin:6px 0; padding:4px 10px; border-radius:8px; background:var(--bad-bg); color:var(--bad); font-weight:600; font-size:14px; }
</style>
</head>
<body>
<main>
  <header>
    <div class="eyebrow">Round doc check</div>
    <h1>${esc(doc.title)}</h1>
    <p class="meta">${esc([team, `Owner: ${owner}`, partners.length ? `Partners: ${partners.join(', ')}` : ''].filter(Boolean).join(' · '))}</p>
    ${doc.deletedAt ? `<p class="deleted-note">Deleted${doc.deletedByName ? ` by ${esc(doc.deletedByName)}` : ''} on ${esc(date(doc.deletedAt))}, ${esc(clock(doc.deletedAt))}. The record below is kept.</p>` : ''}
    <p class="meta">${first ? `Edits from ${esc(date(first))}, ${esc(clock(first))} to ${esc(clock(last!))} (${esc(zoneName())})` : 'No edits yet.'}</p>
  </header>

  ${verdict}

  <dl class="stats">
    <div class="stat"><dt>Characters typed live</dt><dd>${live.reduce((n, u) => n + u.inserted, 0).toLocaleString()}</dd></div>
    <div class="stat"><dt>Large single edits</dt><dd class="${large.length ? 'warn' : ''}">${large.length}</dd></div>
    <div class="stat"><dt>Blocked pastes</dt><dd class="${blocked.length ? 'warn' : ''}">${blocked.length}</dd></div>
    ${record.events.some((e) => e.kind === 'save-failed') ? `<div class="stat"><dt>Edits the server could not save</dt><dd class="warn">${record.events.filter((e) => e.kind === 'save-failed').reduce((n, e) => n + (e.n ?? 1), 0)}</dd></div>` : ''}
    <div class="stat"><dt>Round doc turned off</dt><dd class="${roundOff.length ? 'warn' : ''}">${roundOff.length}</dd></div>
    <div class="stat"><dt>Time in other apps</dt><dd>${minutes(awayMs)}</dd></div>
  </dl>

  ${chart ? `<section class="card"><h2>Typing over time</h2>${chart}</section>` : ''}

  <section class="card">
    <h2>Who typed</h2>
    <table><thead><tr><th>Name</th><th class="num">Characters typed</th><th class="num">Deleted</th><th class="num">Edits</th></tr></thead><tbody>${peopleRows || '<tr><td colspan="4">Nobody yet.</td></tr>'}</tbody></table>
  </section>

  <section class="card">
    <h2>Worth a look</h2>
    ${timeline.length ? `<ul class="events">${timeline.map((e) => `<li class="${e.warn ? 'warn' : ''}"><span class="t">${esc(clock(e.at))}</span><span class="w">${esc(e.who)}</span><span class="x what">${esc(e.what)}${e.text ? `: “${esc(e.text.slice(0, 300))}”` : ''}</span></li>`).join('')}</ul>` : '<p class="note">Nothing unusual: only steady typing.</p>'}
    <p class="note">“Large single edit” means a lot of text arrived at once while connected, which is what pasting looks like (dictation and autocorrect can too). Text synced after being offline is listed separately and isn't flagged.</p>
  </section>

  <section class="card">${textSection}</section>

  <footer>
    Times are recorded by the ParliPrepRoom server as each edit arrives. This page shows what happened inside ParliPrepRoom; it can't see another screen or a phone. Checked ${esc(date(Date.now()))}, ${esc(clock(Date.now()))}. Link: ${esc(url)}
  </footer>
</main>
</body>
</html>`;
}
