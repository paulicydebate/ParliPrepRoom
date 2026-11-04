import { useEffect, useState } from 'react';
import { toast } from '../editor/roundGuard';
import { forgetInvite, respondToInvite, useInvites, setSpace, type Invite } from '../store/account';
import { syncDocList } from '../store/docs';

const label = (i: Invite) => [i.roundLabel ?? i.title, i.tournamentName].filter(Boolean).join(' · ') || i.title;

/**
 * "Ana invited you to co-edit …": a bar under the top bar for each pending
 * invitation. Accepting opens the doc; nothing is shared until you accept.
 */
export function InviteBanner({ onOpenDoc }: { onOpenDoc: (docId: string) => void }) {
  const invites = useInvites();
  const [busy, setBusy] = useState<string | null>(null);

  // The tab title shows how many are waiting, so it's noticed in another tab.
  useEffect(() => {
    const base = 'ParliPrepRoom';
    document.title = invites.length ? `(${invites.length}) ${base}` : base;
    return () => {
      document.title = base;
    };
  }, [invites.length]);

  if (!invites.length) return null;

  const answer = async (i: Invite, accept: boolean) => {
    setBusy(i.docId);
    try {
      const r = await respondToInvite(i.docId, accept);
      forgetInvite(i.docId);
      if (accept && r.doc) {
        // Show the team's docs (the invited doc lives there), then open it.
        setSpace(i.teamId);
        await syncDocList(i.teamId).catch(() => {});
        onOpenDoc(i.docId);
        toast(`You're co-editing “${label(i)}” with ${i.ownerName || 'your partner'}.`);
      } else if (!accept) {
        toast(`Declined. ${i.ownerName || 'They'} will see that you said no.`);
      }
    } catch (e) {
      toast((e as Error).message);
    }
    setBusy(null);
  };

  return (
    <div className="invite-bars" role="region" aria-label="Invitations">
      {invites.slice(0, 3).map((i) => (
        <div key={i.docId} className="invite-bar">
          <span>
            <strong>{i.ownerName || 'Someone'}</strong> invited you to co-edit <strong>{label(i)}</strong>
            {i.round ? ' (a round doc: paste off, typing recorded)' : ''}. Nothing is shared until you accept.
          </span>
          <span className="tb-spacer" />
          <button type="button" className="btn ghost small" disabled={busy === i.docId} onClick={() => void answer(i, false)}>
            Decline
          </button>
          <button type="button" className="btn primary small" disabled={busy === i.docId} onClick={() => void answer(i, true)}>
            Accept
          </button>
        </div>
      ))}
      {invites.length > 3 && <div className="invite-bar muted small">+ {invites.length - 3} more waiting</div>}
    </div>
  );
}
