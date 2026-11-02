import { useEffect, useRef, useState } from 'react';
import { toast } from '../editor/roundGuard';
import { deleteServerDoc, restoreServerDoc, teamDeleted, teamRounds, type DeletedDoc, type DeletionEntry, type RoundRow } from '../store/account';
import { syncDocList } from '../store/docs';
import { IconClose } from './icons';

function ago(ms: number | null) {
  if (!ms) return 'No edits yet';
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(ms).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

const when = (ms: number) =>
  new Date(ms).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** Deleted round docs count as flagged. */
const flagsOf = (r: RoundRow) => r.summary.flags + (r.deletedAt ? 1 : 0);

function Flags({ s, row }: { s: RoundRow['summary']; row: RoundRow }) {
  const chips: { text: string; bad?: boolean }[] = [];
  if (row.deletedAt) chips.push({ text: `Deleted${row.deletedByName ? ` by ${row.deletedByName}` : ''} ${when(row.deletedAt)}`, bad: true });
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
  const [tab, setTab] = useState<'rounds' | 'deleted' | 'log'>('rounds');
  const [trash, setTrash] = useState<{ docs: DeletedDoc[]; log: DeletionEntry[] } | null>(null);
  const loadTrash = () => void teamDeleted(teamId).then(setTrash, (e: Error) => setError(e.message));
  const load = () => {
    setError(null);
    teamRounds(teamId).then(
      (r) => setRows(r.sort((a, b) => flagsOf(b) - flagsOf(a) || (b.summary.lastAt ?? 0) - (a.summary.lastAt ?? 0))),
      (e: Error) => setError(e.message),
    );
  };
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    load();
    loadTrash();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  const shown = rows?.filter((r) => !onlyFlagged || flagsOf(r) > 0) ?? [];
  const flagged = rows?.filter((r) => flagsOf(r) > 0).length ?? 0;
  const refresh = () => {
    load();
    loadTrash();
  };
  const open = (id: string) => {
    onOpenDoc(id);
    onClose();
  };

  return (
    <dialog ref={ref} className="settings coach-view" onClose={onClose} onCancel={onClose}>
      <div className="settings-head">
        <h2>Coach view · {teamName}</h2>
        <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
          <IconClose />
        </button>
      </div>
      <div className="seg coach-tabs" role="group" aria-label="Show">
        <button type="button" className={tab === 'rounds' ? 'is-on' : ''} onClick={() => setTab('rounds')}>
          Round docs
        </button>
        <button type="button" className={tab === 'deleted' ? 'is-on' : ''} onClick={() => setTab('deleted')}>
          Recently deleted{trash?.docs.length ? ` (${trash.docs.length})` : ''}
        </button>
        <button type="button" className={tab === 'log' ? 'is-on' : ''} onClick={() => setTab('log')}>
          Deletion log
        </button>
      </div>
      {error && <p className="muted">{error}</p>}
      {tab === 'rounds' && (
        <RoundList rows={rows} shown={shown} flagged={flagged} onlyFlagged={onlyFlagged} setOnlyFlagged={setOnlyFlagged} refresh={refresh} open={open} />
      )}
      {tab === 'deleted' && <DeletedList docs={trash?.docs ?? null} refresh={refresh} open={open} />}
      {tab === 'log' && <DeletionLog log={trash?.log ?? null} />}
    </dialog>
  );
}

function RoundList({
  rows,
  shown,
  flagged,
  onlyFlagged,
  setOnlyFlagged,
  refresh,
  open,
}: {
  rows: RoundRow[] | null;
  shown: RoundRow[];
  flagged: number;
  onlyFlagged: boolean;
  setOnlyFlagged: (v: boolean) => void;
  refresh: () => void;
  open: (id: string) => void;
}) {
  return (
    <>
      <p className="muted">
        Every round doc on the team, including deleted ones, from the server's record (students can't edit it). Docs with something worth a look come first. Open the check page to
        see every character typed and deleted, by whom and when.
      </p>
      <div className="coach-bar">
        <span className="muted small">{rows ? `${rows.length} round doc${rows.length === 1 ? '' : 's'} · ${flagged} with flags` : 'Loading…'}</span>
        <span className="tb-spacer" />
        <label className="check">
          <input type="checkbox" checked={onlyFlagged} onChange={(e) => setOnlyFlagged(e.target.checked)} /> Only flagged
        </label>
        <button type="button" className="btn ghost small" onClick={refresh}>
          Refresh
        </button>
      </div>
      {rows && rows.length === 0 && <p className="muted">No round docs on this team yet. They appear here when a student switches a doc to Round doc.</p>}
      <ul className="coach-list">
        {shown.map((r) => (
          <li key={r.id} className={flagsOf(r) ? 'has-flags' : ''}>
            <div className="coach-main">
              <strong className="coach-title">{r.title || 'Untitled'}</strong>
              <span className="muted small">
                {[r.owner, ...r.partners].filter(Boolean).join(' · ')} · edited {ago(r.summary.lastAt)} · {r.summary.typedLive.toLocaleString()} characters typed live
              </span>
              <Flags s={r.summary} row={r} />
            </div>
            <div className="coach-actions">
              <button type="button" className="btn small" onClick={() => open(r.id)}>
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
    </>
  );
}

function DeletedList({ docs, refresh, open }: { docs: DeletedDoc[] | null; refresh: () => void; open: (id: string) => void }) {
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const act = async (teamId: string | null, fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await fn();
      toast(done);
      if (teamId) await syncDocList(teamId).catch(() => {});
    } catch (e) {
      toast((e as Error).message);
    }
    setBusy(false);
    setConfirm(null);
    refresh();
  };
  return (
    <>
      <p className="muted">
        Team docs anyone deleted. Students can't see these any more; coaches can open them, restore them, or delete them for good. Round docs from a tournament can't be deleted for
        good, because the tab room keeps them.
      </p>
      {!docs && <p className="muted">Loading…</p>}
      {docs?.length === 0 && <p className="muted">Nothing deleted.</p>}
      <ul className="coach-list">
        {docs?.map((d) => (
          <li key={d.id}>
            <div className="coach-main">
              <strong className="coach-title">
                {d.title || 'Untitled'} {d.round && <span className="coach-chip">Round doc</span>}
              </strong>
              <span className="muted small">
                Owner {d.owner || '—'} · deleted{d.deletedByName ? ` by ${d.deletedByName}` : ''} {d.deletedAt ? when(d.deletedAt) : ''}
              </span>
            </div>
            <div className="coach-actions">
              <button type="button" className="btn small" onClick={() => open(d.id)}>
                Open
              </button>
              <button type="button" className="btn small" disabled={busy} onClick={() => void act(d.teamId, () => restoreServerDoc(d.id), `Restored “${d.title}”.`)}>
                Restore
              </button>
              {confirm === d.id ? (
                <button
                  type="button"
                  className="btn small danger-fill"
                  disabled={busy}
                  onClick={() => void act(d.teamId, () => deleteServerDoc(d.id), `Deleted “${d.title}” for good.`)}
                >
                  Yes, delete for good
                </button>
              ) : (
                <button
                  type="button"
                  className="btn small ghost"
                  disabled={d.tournamentLocked}
                  title={d.tournamentLocked ? 'Tournament round docs stay for the tab room' : 'Deletes the doc and its record. The deletion log keeps a line saying it happened.'}
                  onClick={() => setConfirm(d.id)}
                >
                  Delete for good
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

const ACTION: Record<DeletionEntry['action'], string> = {
  deleted: 'deleted',
  restored: 'restored',
  purged: 'deleted for good',
  'moved-out': 'moved out of the team',
};

function DeletionLog({ log }: { log: DeletionEntry[] | null }) {
  return (
    <>
      <p className="muted">Every deletion, restore and permanent delete on the team, newest first. Lines stay even after a doc is deleted for good.</p>
      {!log && <p className="muted">Loading…</p>}
      {log?.length === 0 && <p className="muted">No deletions yet.</p>}
      <ul className="deletion-log">
        {log?.map((e, i) => (
          <li key={i} className={'is-' + e.action}>
            <span className="muted small">{when(e.at)}</span>
            <span>
              <strong>{e.userName || 'Someone'}</strong> {ACTION[e.action]} “{e.title}”{e.round ? ' (round doc)' : ''}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
