import { useEffect, useState } from 'react';
import { toast } from '../editor/roundGuard';
import { forgetInvite, respondToInvite, useInvites, setSpace, type Invite } from '../store/account';
import { syncDocList } from '../store/docs';

const label = (i: Invite) => [i.roundLabel ?? i.title, i.tournamentName].filter(Boolean).join(' · ') || i.title;

/** The doc and flow someone made together for one round arrive as one invitation. */
export function groupInvites(list: Invite[]): Invite[][] {
  const groups: Invite[][] = [];
  for (const i of list) {
    const g = i.roundLabel ? groups.find((x) => x[0].roundLabel === i.roundLabel && x[0].teamId === i.teamId && x[0].ownerName === i.ownerName && Math.abs(x[0].invitedAt - i.invitedAt) < 120_000) : undefined;
    if (g) g.push(i);
    else groups.push([i]);
  }
  return groups;
}

/**
 * "Ana invited you to co-edit …": a bar under the top bar for each pending
 * invitation. Accepting opens the doc; nothing is shared until you accept.
 */
export function InviteBanner({ onOpen }: { onOpen: (docs: { id: string; format: 'doc' | 'flow' }[]) => void }) {
  const invites = useInvites();
  const groups = groupInvites(invites);
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

  const answer = async (group: Invite[], accept: boolean) => {
    const first = group[0];
    setBusy(first.docId);
    try {
      const results = [];
      for (const i of group) {
        results.push(await respondToInvite(i.docId, accept));
        forgetInvite(i.docId);
      }
      if (accept && results.some((r) => r.doc)) {
        // Show the team's docs (the invited docs live there), then open them side by side.
        setSpace(first.teamId);
        await syncDocList(first.teamId).catch(() => {});
        onOpen(group.map((i) => ({ id: i.docId, format: i.format ?? 'doc' })));
        toast(`You're co-editing “${label(first)}” with ${first.ownerName || 'your partner'}.`);
      } else if (!accept) {
        toast(`Declined. ${first.ownerName || 'They'} will see that you said no.`);
      }
    } catch (e) {
      toast((e as Error).message);
    }
    setBusy(null);
  };

  const what = (g: Invite[]) => (g.length > 1 ? ' (a prep doc and a flow, both round docs: paste off, typing recorded)' : g[0].round ? (g[0].format === 'flow' ? ' (a round flow: paste off, typing recorded)' : ' (a round doc: paste off, typing recorded)') : '');

  return (
    <div className="invite-bars" role="region" aria-label="Invitations">
      {groups.slice(0, 3).map((g) => (
        <div key={g[0].docId} className="invite-bar">
          <span>
            <strong>{g[0].ownerName || 'Someone'}</strong> invited you to co-edit <strong>{label(g[0])}</strong>
            {what(g)}. Nothing is shared until you accept.
          </span>
          <span className="tb-spacer" />
          <button type="button" className="btn ghost small" disabled={busy === g[0].docId} onClick={() => void answer(g, false)}>
            Decline
          </button>
          <button type="button" className="btn primary small" disabled={busy === g[0].docId} onClick={() => void answer(g, true)}>
            Accept
          </button>
        </div>
      ))}
      {groups.length > 3 && <div className="invite-bar muted small">+ {groups.length - 3} more waiting</div>}
    </div>
  );
}
