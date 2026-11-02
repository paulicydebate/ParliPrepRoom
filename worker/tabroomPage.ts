import type { DocRecord, Tournament } from './directory';
import type { RecordSummary } from './summary';

// The tournament director's page (/td/<secret>): every round doc tagged with
// the tournament, from every team, problems first. No sign-in needed: the
// link itself is the key, so it should only go to the tab room.

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export interface TabroomRow {
  doc: DocRecord & { teamName: string; ownerName: string; partnerNames: string[] };
  summary: RecordSummary;
}

function chips(s: RecordSummary) {
  const out: string[] = [];
  if (!s.intact) out.push('<span class="chip bad">Record does not check out</span>');
  if (s.blocked) out.push(`<span class="chip bad">${s.blocked} blocked paste${s.blocked > 1 ? 's' : ''}</span>`);
  if (s.large) out.push(`<span class="chip bad">${s.large} large edit${s.large > 1 ? 's' : ''}</span>`);
  if (s.roundOff) out.push('<span class="chip bad">Round doc turned off</span>');
  if (s.roundModeOff) out.push(`<span class="chip">Left Round Mode ×${s.roundModeOff}</span>`);
  if (s.awayMs > 60_000) out.push(`<span class="chip">${Math.round(s.awayMs / 60_000)} min in other apps</span>`);
  if (s.catchup >= 20) out.push(`<span class="chip">${s.catchup.toLocaleString()} chars synced after offline</span>`);
  if (!out.length) out.push('<span class="chip ok">Nothing flagged</span>');
  return out.join('');
}

export function renderTabroomPage(t: Tournament, rows: TabroomRow[], secret: string, tz: string): string {
  const clock = (ms: number | null) => (ms ? new Date(ms).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: tz }) : '—');
  const sorted = [...rows].sort((a, b) => Number(!!b.doc.deletedAt) - Number(!!a.doc.deletedAt) || b.summary.flags - a.summary.flags || (b.summary.lastAt ?? 0) - (a.summary.lastAt ?? 0));
  const flagged = rows.filter((r) => r.summary.flags > 0).length;
  const list = sorted
    .map(
      (r) => `<li class="${r.summary.flags || r.doc.deletedAt ? 'flagged' : ''}">
        <div class="main">
          <div class="title"><strong>${esc(r.doc.roundLabel || 'Round ?')}</strong> · ${esc(r.doc.teamName || 'No team')} · ${esc(r.doc.title)}</div>
          <div class="meta">${esc([r.doc.ownerName, ...r.doc.partnerNames].filter(Boolean).join(', '))} · last edit ${esc(clock(r.summary.lastAt))} · ${r.summary.typedLive.toLocaleString()} characters typed live</div>
          <div class="chips">${r.doc.deletedAt ? `<span class="chip bad">Deleted${r.doc.deletedByName ? ` by ${esc(r.doc.deletedByName)}` : ''} ${esc(clock(r.doc.deletedAt))}</span>` : ''}${chips(r.summary)}</div>
        </div>
        <a class="btn" href="/td/${esc(secret)}/doc/${esc(r.doc.id)}">Full record</a>
      </li>`,
    )
    .join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<title>Tab room · ${esc(t.name)}</title>
<style>
  :root { --bg:#f6f5f2; --card:#fff; --text:#1d1f1e; --muted:#5c615e; --line:#e3e3de; --accent:#1f6f5c; --bad:#b42318; --bad-bg:#fde4e1; --ok:#135c33; --ok-bg:#dcf5e6; color-scheme: light; }
  @media (prefers-color-scheme: dark) { :root { --bg:#111413; --card:#181c1b; --text:#e7ebe9; --muted:#a5ada9; --line:#2a302e; --accent:#4cc3a0; --bad:#f6b2a9; --bad-bg:#43201c; --ok:#9be3b8; --ok-bg:#163a26; color-scheme: dark; } }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif; padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) 40px max(16px, env(safe-area-inset-left)); }
  main { max-width: 900px; margin: 0 auto; display:flex; flex-direction:column; gap:14px; }
  header { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:16px; }
  .eyebrow { font-size:12px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:var(--accent); }
  h1 { margin:4px 0; font-size:24px; }
  .muted { color:var(--muted); margin:0; }
  ul { list-style:none; margin:0; padding:0; background:var(--card); border:1px solid var(--line); border-radius:14px; overflow:hidden; }
  li { display:flex; gap:12px; align-items:center; justify-content:space-between; padding:12px 14px; border-top:1px solid var(--line); flex-wrap:wrap; }
  li:first-child { border-top:0; }
  li.flagged { border-left:4px solid var(--bad); }
  .main { flex:1 1 420px; min-width:0; display:flex; flex-direction:column; gap:4px; }
  .meta { color:var(--muted); font-size:13px; }
  .chips { display:flex; gap:6px; flex-wrap:wrap; }
  .chip { font-size:12px; padding:2px 8px; border-radius:10px; background:var(--bg); color:var(--muted); }
  .chip.bad { background:var(--bad-bg); color:var(--bad); font-weight:600; }
  .chip.ok { background:var(--ok-bg); color:var(--ok); }
  .btn { flex:none; display:inline-block; padding:7px 12px; border-radius:8px; background:var(--accent); color:#fff; font-weight:600; text-decoration:none; }
  .empty { padding:20px; color:var(--muted); background:var(--card); border:1px solid var(--line); border-radius:14px; }
</style>
</head>
<body><main>
  <header>
    <div class="eyebrow">Tab room</div>
    <h1>${esc(t.name)}</h1>
    <p class="muted">Tournament code <strong>${esc(t.code)}</strong> · ${rows.length} round doc${rows.length === 1 ? '' : 's'} · ${flagged} with flags · times in ${esc(tz)}</p>
    <p class="muted">Round docs whose teams entered this tournament's code. Each record is kept on the ParliPrepRoom server as it's typed; students can't change it. Keep this link private.</p>
  </header>
  ${rows.length ? `<ul>${list}</ul>` : '<p class="empty">No round docs yet. Teams add the tournament code when they start a round in ParliPrepRoom (New round).</p>'}
</main></body></html>`;
}
