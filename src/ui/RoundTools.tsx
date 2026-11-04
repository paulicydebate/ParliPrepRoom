import qrcode from 'qrcode-generator';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from '../editor/roundGuard';
import { respondToInvite, teamDetails, useAccount, type Member } from '../store/account';
import { setDocAccess, setDocPartners, syncDocList, type DocMeta } from '../store/docs';
import { IconClose } from './icons';

/** "Partners" button on a team round doc: who besides the owner and coaches can open it. */
export function PartnersButton({ meta }: { meta: DocMeta }) {
  const acct = useAccount();
  const [open, setOpen] = useState(false);
  // Floats above the window (a pane clips anything that sticks out of it).
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) ref.current.open = false;
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);
  const [members, setMembers] = useState<Member[] | null>(null);
  useEffect(() => {
    if (!open || !meta.teamId) return;
    void syncDocList(meta.teamId).catch(() => {}); // so "waiting" / "co-editing" is current
    void teamDetails(meta.teamId).then((t) => setMembers(t.members), () => setMembers([]));
  }, [open, meta.teamId]);
  const accepted = meta.partners ?? [];
  const pending = meta.pendingPartners ?? [];
  const declined = meta.declinedPartners ?? [];
  // Who should be a partner: those who accepted plus those invited. Show the tick right away; the server catches up.
  const [partners, setPartners] = useState<string[]>([...accepted, ...pending]);
  useEffect(() => setPartners([...(meta.partners ?? []), ...(meta.pendingPartners ?? [])]), [meta.partners, meta.pendingPartners]);
  if (!meta.teamId) return null;
  const canEdit = meta.ownerId === acct.user?.id || acct.teams.find((t) => t.id === meta.teamId)?.role === 'coach';
  const iAmPartner = !!acct.user && accepted.includes(acct.user.id);

  const isRound = !!meta.round;
  const everyone = !isRound && meta.access === 'team';
  const students = members?.filter((m) => m.userId !== meta.ownerId && m.role === 'student') ?? [];
  const partnerLabel = accepted.length && pending.length ? `Partners (${accepted.length} + ${pending.length} waiting)` : accepted.length ? `Partners (${accepted.length})` : pending.length ? 'Invite sent' : isRound ? 'Partners' : 'Only me';
  const label = everyone ? 'Whole team' : partnerLabel;
  const statusOf = (id: string) => (accepted.includes(id) ? 'co-editing' : pending.includes(id) ? 'invited, waiting for them' : declined.includes(id) ? 'declined' : '');

  return (
    <details
      ref={ref}
      className="partners-menu"
      open={open}
      onToggle={(e) => {
        const d = e.currentTarget as HTMLDetailsElement;
        setOpen(d.open);
        if (d.open) {
          const r = d.getBoundingClientRect();
          setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - 280)) });
        }
      }}
    >
      <summary className="btn ghost small" title={isRound ? 'Who can open this round doc' : 'Who can open and edit this doc'}>
        {label}
      </summary>
      <div className="menu partners-pop" style={pos ? { position: 'fixed', top: pos.top, left: pos.left, right: 'auto' } : undefined}>
        {isRound ? (
          <p className="muted small">Round docs open only to the owner, partners who accepted, and the team's coaches. Checking a name sends them an invitation they have to accept.</p>
        ) : (
          <>
            <p className="muted small">Who can open and edit this doc? Coaches can always open it.</p>
            <label className="check-row">
              <input type="radio" name={`access-${meta.id}`} disabled={!canEdit} checked={!everyone} onChange={() => void setDocAccess(meta.id, 'partners')} />
              Just me and partners who accept my invitation
            </label>
            <label className="check-row">
              <input type="radio" name={`access-${meta.id}`} disabled={!canEdit} checked={everyone} onChange={() => void setDocAccess(meta.id, 'team')} />
              Everyone on the team
            </label>
          </>
        )}
        {!everyone && (
          <>
            {!members && <p className="muted small">Loading team…</p>}
            {students.map((m) => (
              <label key={m.userId} className="check-row">
                <input
                  type="checkbox"
                  disabled={!canEdit}
                  checked={partners.includes(m.userId)}
                  onChange={(e) => {
                    const next = e.target.checked ? [...partners, m.userId] : partners.filter((p) => p !== m.userId);
                    setPartners(next);
                    void setDocPartners(meta.id, next);
                  }}
                />
                <span>
                  {m.name}
                  {statusOf(m.userId) && <span className={'partner-status ' + (declined.includes(m.userId) ? 'is-declined' : '')}> · {statusOf(m.userId)}</span>}
                </span>
              </label>
            ))}
            {members && students.length === 0 && <p className="muted small">No other students on the team yet.</p>}
          </>
        )}
        {!canEdit && <p className="muted small">Only the doc's owner or a coach can change this.</p>}
        {iAmPartner && !canEdit && (
          <button
            type="button"
            className="btn ghost small"
            onClick={() => {
              void respondToInvite(meta.id, false)
                .then(() => syncDocList(meta.teamId!))
                .catch((e: Error) => toast(e.message));
            }}
          >
            Leave this doc
          </button>
        )}
      </div>
    </details>
  );
}

/** "Check link" button: a link and QR code an opponent or judge can open to check the typing record. */
export function CheckLinkButton({ meta }: { meta: DocMeta }) {
  const [open, setOpen] = useState(false);
  if (!meta.checkToken) return null;
  return (
    <>
      <button type="button" className="btn ghost small round-check" onClick={() => setOpen(true)} title="Show the check link and QR code for this round doc">
        Check link
      </button>
      {open && createPortal(<CheckDialog token={meta.checkToken} title={meta.title} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

function CheckDialog({ token, title, onClose }: { token: string; title: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  const link = `${location.origin}/check/${token}`;
  const svg = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(link);
    qr.make();
    return qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
  }, [link]);
  return (
    <dialog ref={ref} className="settings check-dialog" onClose={onClose} onCancel={onClose}>
      <div className="settings-head">
        <h2>Check this round doc</h2>
        <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
          <IconClose />
        </button>
      </div>
      <p className="muted">
        An opponent, judge or coach can scan this to see who typed “{title}”, when, and anything unusual. It shows the server's record, which the student can't edit. The prep itself stays private.
      </p>
      <div className="qr" dangerouslySetInnerHTML={{ __html: svg }} />
      <code className="invite-link">{link}</code>
      <div className="settings-foot">
        <a className="btn" href={link} target="_blank" rel="noreferrer">
          Open check page
        </a>
        <button
          type="button"
          className="btn primary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(link);
              toast('Check link copied.');
            } catch {
              toast('Copy the link from the box.');
            }
          }}
        >
          Copy link
        </button>
      </div>
    </dialog>
  );
}
