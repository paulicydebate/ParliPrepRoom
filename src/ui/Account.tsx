import { useEffect, useRef, useState } from 'react';
import { toast } from '../editor/roundGuard';
import {
  PERSONAL,
  createTeam,
  deleteAccount,
  resetInvite,
  devSignInUrl,
  renameTeam,
  setSpace,
  signInUrl,
  signOut,
  teamDetails,
  updateMember,
  useAccount,
  type Role,
  type TeamDetails,
} from '../store/account';
import { CoachView } from './CoachView';
import { IconClose } from './icons';

/** Top bar: sign in, or switch team and open team settings. */
export function AccountBar({ onOpenDoc }: { onOpenDoc: (id: string) => void }) {
  const acct = useAccount();
  const [teamOpen, setTeamOpen] = useState(false);
  const [newTeamOpen, setNewTeamOpen] = useState(false);
  const [coachOpen, setCoachOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [devName, setDevName] = useState('');

  if (!acct.loaded || !acct.server) return null;

  if (!acct.user) {
    if (acct.signIn.google) {
      return (
        <a className="btn primary" href={signInUrl()}>
          Sign in with Google
        </a>
      );
    }
    if (acct.signIn.dev) {
      return (
        <form
          className="dev-signin"
          onSubmit={(e) => {
            e.preventDefault();
            if (devName.trim()) location.href = devSignInUrl(devName.trim());
          }}
        >
          <input value={devName} onChange={(e) => setDevName(e.target.value)} placeholder="Test name" aria-label="Test sign-in name" />
          <button className="btn" type="submit">
            Test sign-in
          </button>
        </form>
      );
    }
    return (
      <span className="muted small" title="The server owner still has to add the Google sign-in key">
        Sign-in coming soon
      </span>
    );
  }

  const team = acct.teams.find((t) => t.id === acct.space) ?? null;
  return (
    <div className="account-bar">
      <label className="space-select" title="Which team's docs to show">
        <span className="sr-only">Team</span>
        <select
          value={acct.space}
          onChange={(e) => {
            if (e.target.value === '__new') setNewTeamOpen(true);
            else setSpace(e.target.value);
          }}
        >
          {acct.teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
              {t.role === 'coach' ? ' (coach)' : ''}
            </option>
          ))}
          <option value={PERSONAL}>My own docs</option>
          <option value="__new">+ New team…</option>
        </select>
      </label>
      {team?.role === 'coach' && (
        <button type="button" className="btn ghost small" onClick={() => setCoachOpen(true)} title="Every round doc on the team and anything flagged">
          Coach view
        </button>
      )}
      {team && (
        <button type="button" className="btn ghost small" onClick={() => setTeamOpen(true)}>
          Team
        </button>
      )}
      <details className="account-menu">
        <summary className="avatar" title={`${acct.user.name} (${acct.user.email})`} aria-label="Account">
          {acct.user.picture ? <img src={acct.user.picture} alt="" referrerPolicy="no-referrer" /> : initials(acct.user.name)}
        </summary>
        <div className="menu">
          <div className="menu-head">
            <strong>{acct.user.name}</strong>
            <span className="muted">{acct.user.email}</span>
          </div>
          <button type="button" onClick={() => setNewTeamOpen(true)}>
            New team…
          </button>
          <button type="button" onClick={() => void signOut()}>
            Sign out
          </button>
          <button type="button" className="danger" onClick={() => setDeleteOpen(true)}>
            Delete my account…
          </button>
        </div>
      </details>
      {teamOpen && team && <TeamDialog teamId={team.id} onClose={() => setTeamOpen(false)} />}
      {newTeamOpen && <NewTeamDialog onClose={() => setNewTeamOpen(false)} />}
      {deleteOpen && <DeleteAccountDialog onClose={() => setDeleteOpen(false)} />}
      {coachOpen && team && <CoachView teamId={team.id} teamName={team.name} onOpenDoc={onOpenDoc} onClose={() => setCoachOpen(false)} />}
    </div>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

function useModal(onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  return { ref, onClose, onCancel: onClose };
}

function NewTeamDialog({ onClose }: { onClose: () => void }) {
  const modal = useModal(onClose);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <dialog {...modal} className="settings">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          setBusy(true);
          try {
            await createTeam(name.trim());
            toast('Team created. Open Team to copy invite links.');
            onClose();
          } catch (err) {
            toast((err as Error).message);
            setBusy(false);
          }
        }}
      >
        <div className="settings-head">
          <h2>New team</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <IconClose />
          </button>
        </div>
        <p className="muted">You'll be the team's coach. Then share the student invite link with your debaters.</p>
        <input id="pp-team-name" className="name-input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Team name, e.g. Riverside Parli" aria-label="Team name" />
        <div className="settings-foot">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={!name.trim() || busy}>
            Create team
          </button>
        </div>
      </form>
    </dialog>
  );
}

function InviteRow({ label, hint, code, onReset }: { label: string; hint: string; code: string; onReset: () => Promise<void> }) {
  const link = `${location.origin}/#invite=${code}`;
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="invite-row">
      <div>
        <strong>{label}</strong>
        <div className="muted small">{hint}</div>
        <code className="invite-link">{link}</code>
      </div>
      <button
        type="button"
        className="btn"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(link);
            toast('Invite link copied.');
          } catch {
            toast('Copy the link from the box.');
          }
        }}
      >
        Copy
      </button>
      <button
        type="button"
        className={'btn ghost small' + (confirm ? ' danger-text' : '')}
        title="Make a new link and turn this one off (for when a link got passed around)"
        onClick={async () => {
          if (!confirm) {
            setConfirm(true);
            setTimeout(() => setConfirm(false), 4000);
            return;
          }
          setConfirm(false);
          await onReset();
          toast(`New ${label.toLowerCase()} link made. The old one no longer works.`);
        }}
      >
        {confirm ? 'Turn off old link?' : 'New link'}
      </button>
    </div>
  );
}

/** Download every doc you can see in a space as Word files in a .zip. */
function DownloadAllButton({ space, name }: { space: string; name: string }) {
  const [progress, setProgress] = useState<string | null>(null);
  return (
    <button
      type="button"
      className="btn"
      disabled={progress !== null}
      onClick={async () => {
        setProgress('Starting…');
        try {
          const { buildTeamZip } = await import('../export/teamZip');
          const { download, safeFilename } = await import('../export/runs');
          const zip = await buildTeamZip(space, name, (d, t) => setProgress(`${d} of ${t}…`));
          download(zip, `${safeFilename(name)} backup ${new Date().toISOString().slice(0, 10)}.zip`, 'application/zip');
          toast('Backup downloaded.');
        } catch (e) {
          toast((e as Error).message);
        } finally {
          setProgress(null);
        }
      }}
    >
      {progress ?? 'Download all docs (.zip)'}
    </button>
  );
}

function DeleteAccountDialog({ onClose }: { onClose: () => void }) {
  const modal = useModal(onClose);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <dialog {...modal} className="settings">
      <div className="settings-head">
        <h2>Delete my account</h2>
        <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
          <IconClose />
        </button>
      </div>
      <p>This permanently deletes:</p>
      <ul>
        <li>your account and sign-in,</li>
        <li>your docs under “My own docs”, with their records,</li>
        <li>teams where you're the only member, with their docs.</li>
      </ul>
      <p className="muted">
        Docs you made inside a team you share stay with that team (your coach can delete them). If you're the only coach of a team with other members, make someone else a coach first. Download a backup first if you want one.
      </p>
      <label className="row-inline">
        Type DELETE to confirm
        <input className="name-input" value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Type DELETE to confirm" />
      </label>
      <div className="settings-foot">
        <button type="button" className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="btn danger-fill"
          disabled={typed.trim() !== 'DELETE' || busy}
          onClick={async () => {
            setBusy(true);
            try {
              await deleteAccount();
              location.href = '/';
            } catch (e) {
              toast((e as Error).message);
              setBusy(false);
            }
          }}
        >
          Delete my account
        </button>
      </div>
    </dialog>
  );
}

export function TeamDialog({ teamId, onClose }: { teamId: string; onClose: () => void }) {
  const modal = useModal(onClose);
  const acct = useAccount();
  const [team, setTeam] = useState<TeamDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => teamDetails(teamId).then(setTeam, (e: Error) => setError(e.message));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);
  const coach = team?.role === 'coach';

  const change = async (userId: string, c: { role?: Role; remove?: boolean }) => {
    try {
      await updateMember(teamId, userId, c);
      await load();
    } catch (e) {
      toast((e as Error).message);
    }
  };

  return (
    <dialog {...modal} className="settings team-dialog">
      <div className="settings-head">
        <h2>{team?.name ?? 'Team'}</h2>
        <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
          <IconClose />
        </button>
      </div>
      {error && <p className="muted">{error}</p>}
      {team && (
        <>
          {coach && (
            <>
              <h3>Team name</h3>
              <input
                className="name-input"
                defaultValue={team.name}
                aria-label="Team name"
                onBlur={async (e) => {
                  const v = e.target.value.trim();
                  if (v && v !== team.name) setTeam(await renameTeam(teamId, v));
                }}
              />
              <h3>Invite links</h3>
              <InviteRow
                label="Students"
                hint="For debaters. They see team docs, their own round docs and ones they're added to."
                code={team.invites!.student}
                onReset={async () => {
                  await resetInvite(teamId, 'student');
                  await load();
                }}
              />
              <InviteRow
                label="Coaches"
                hint="Coaches see every doc on the team, including round docs, and manage members."
                code={team.invites!.coach}
                onReset={async () => {
                  await resetInvite(teamId, 'coach');
                  await load();
                }}
              />
            </>
          )}
          <h3>Members ({team.members.length})</h3>
          <ul className="member-list">
            {team.members.map((m) => (
              <li key={m.userId}>
                <div>
                  <strong>{m.name}</strong>
                  {m.userId === acct.user?.id && <span className="muted small"> (you)</span>}
                  <div className="muted small">{m.email}</div>
                </div>
                {coach ? (
                  <div className="member-actions">
                    <select value={m.role} aria-label={`Role for ${m.name}`} onChange={(e) => void change(m.userId, { role: e.target.value as Role })}>
                      <option value="student">Student</option>
                      <option value="coach">Coach</option>
                    </select>
                    {m.userId !== acct.user?.id && (
                      <button type="button" className="btn ghost small danger-text" onClick={() => void change(m.userId, { remove: true })}>
                        Remove
                      </button>
                    )}
                  </div>
                ) : (
                  <span className="role-chip">{m.role === 'coach' ? 'Coach' : 'Student'}</span>
                )}
              </li>
            ))}
          </ul>
          {!coach && <p className="muted small">Only coaches can invite people or change roles.</p>}
          <h3>Backup</h3>
          <p className="muted small">Every doc you can see on this team, as Word files in one .zip.</p>
          <DownloadAllButton space={teamId} name={team.name} />
        </>
      )}
    </dialog>
  );
}
