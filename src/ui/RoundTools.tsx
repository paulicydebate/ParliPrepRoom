import qrcode from 'qrcode-generator';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from '../editor/roundGuard';
import { teamDetails, useAccount, type Member } from '../store/account';
import { setDocPartners, type DocMeta } from '../store/docs';
import { IconClose } from './icons';

/** "Partners" button on a team round doc: who besides the owner and coaches can open it. */
export function PartnersButton({ meta }: { meta: DocMeta }) {
  const acct = useAccount();
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState<Member[] | null>(null);
  useEffect(() => {
    if (!open || !meta.teamId) return;
    void teamDetails(meta.teamId).then((t) => setMembers(t.members), () => setMembers([]));
  }, [open, meta.teamId]);
  // Show the tick right away; the server catches up in the background.
  const [partners, setPartners] = useState<string[]>(meta.partners ?? []);
  useEffect(() => setPartners(meta.partners ?? []), [meta.partners]);
  if (!meta.teamId) return null;
  const canEdit = meta.ownerId === acct.user?.id || acct.teams.find((t) => t.id === meta.teamId)?.role === 'coach';

  return (
    <details className="partners-menu" open={open} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary className="btn ghost small" title="Who can open this round doc">
        Partners{partners.length ? ` (${partners.length})` : ''}
      </summary>
      <div className="menu partners-pop">
        <p className="muted small">Round docs open only to the owner, the partners checked here, and the team's coaches.</p>
        {!members && <p className="muted small">Loading team…</p>}
        {members
          ?.filter((m) => m.userId !== meta.ownerId && m.role === 'student')
          .map((m) => (
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
              {m.name}
            </label>
          ))}
        {members && members.filter((m) => m.userId !== meta.ownerId && m.role === 'student').length === 0 && (
          <p className="muted small">No other students on the team yet.</p>
        )}
        {!canEdit && <p className="muted small">Only the doc's owner or a coach can change this.</p>}
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
