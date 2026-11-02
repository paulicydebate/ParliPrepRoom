import { useEffect, useRef, useState } from 'react';
import { teamRounds, type RoundRow } from '../store/account';
import { IconClose } from './icons';

function ago(ms: number | null) {
  if (!ms) return 'No edits yet';
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(ms).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function Flags({ s }: { s: RoundRow['summary'] }) {
  const chips: { text: string; bad?: boolean }[] = [];
  if (!s.intact) chips.push({ text: 'Record does not check out', bad: true });
  if (s.blocked) chips.push({ text: `${s.blocked} blocked paste${s.blocked > 1 ? 's' : ''}`, bad: true });
  if (s.large) chips.push({ text: `${s.large} large edit${s.large > 1 ? 's' : ''}`, bad: true });
  if (s.roundOff) chips.push({ text: 'Round doc turned off', bad: true });
  if (s.roundModeOff) chips.push({ text: `Left Round Mode ×${s.roundModeOff}` });
  if (s.awayMs > 60_000) chips.push({ text: `${Math.round(s.awayMs / 60_000)} min in other apps` });
  if (s.catchup >= 20) chips.push({ text: `${s.catchup.toLocaleString()} characters synced after being offline` });
  if (!chips.length) chips.push({ text: 'Nothing flagged' });
  return (
    <span className="coach-flags">
      {chips.map((c) => (
        <span key={c.text} className={'coach-chip' + (c.bad ? ' bad' : c.text === 'Nothing flagged' ? ' ok' : '')}>
          {c.text}
        </span>
      ))}
    </span>
  );
}

/** Coaches: every round doc on the team, problems first. */
export function CoachView({ teamId, teamName, onOpenDoc, onClose }: { teamId: string; teamName: string; onOpenDoc: (id: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [rows, setRows] = useState<RoundRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const load = () => {
    setError(null);
    teamRounds(teamId).then(
      (r) => setRows(r.sort((a, b) => b.summary.flags - a.summary.flags || (b.summary.lastAt ?? 0) - (a.summary.lastAt ?? 0))),
      (e: Error) => setError(e.message),
    );
  };
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  const shown = rows?.filter((r) => !onlyFlagged || r.summary.flags > 0) ?? [];
  const flagged = rows?.filter((r) => r.summary.flags > 0).length ?? 0;

  return (
    <dialog ref={ref} className="settings coach-view" onClose={onClose} onCancel={onClose}>
      <div className="settings-head">
        <h2>Round docs · {teamName}</h2>
        <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
          <IconClose />
        </button>
      </div>
      <p className="muted">
        Every round doc on the team, from the server's record (students can't edit it). Docs with something worth a look come first. Open the check page to see every character typed and deleted, by whom and when.
      </p>
      <div className="coach-bar">
        <span className="muted small">{rows ? `${rows.length} round doc${rows.length === 1 ? '' : 's'} · ${flagged} with flags` : 'Loading…'}</span>
        <span className="tb-spacer" />
        <label className="check">
          <input type="checkbox" checked={onlyFlagged} onChange={(e) => setOnlyFlagged(e.target.checked)} /> Only flagged
        </label>
        <button type="button" className="btn ghost small" onClick={load}>
          Refresh
        </button>
      </div>
      {error && <p className="muted">{error}</p>}
      {rows && rows.length === 0 && <p className="muted">No round docs on this team yet. They appear here when a student switches a doc to Round doc.</p>}
      <ul className="coach-list">
        {shown.map((r) => (
          <li key={r.id} className={r.summary.flags ? 'has-flags' : ''}>
            <div className="coach-main">
              <strong className="coach-title">{r.title || 'Untitled'}</strong>
              <span className="muted small">
                {[r.owner, ...r.partners].filter(Boolean).join(' · ')} · edited {ago(r.summary.lastAt)} · {r.summary.typedLive.toLocaleString()} characters typed live
              </span>
              <Flags s={r.summary} />
            </div>
            <div className="coach-actions">
              <button
                type="button"
                className="btn small"
                onClick={() => {
                  onOpenDoc(r.id);
                  onClose();
                }}
              >
                Open doc
              </button>
              {r.checkToken && (
                <a className="btn small primary" href={`/check/${r.checkToken}`} target="_blank" rel="noreferrer">
                  Check page
                </a>
              )}
            </div>
          </li>
        ))}
      </ul>
    </dialog>
  );
}
