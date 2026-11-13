import type { DocMeta } from '../store/docs';
import { formatOf } from '../store/docs';
import { useEffect, useState } from 'react';
import type * as Y from 'yjs';
import { acquireDoc, releaseDoc } from '../store/registry';
import { useResolution } from '../store/roundDoc';
import { IconClose } from './icons';
import { CheckLinkButton, PartnersButton } from './RoundTools';

// "Round info": the details of the round you are in, in a panel beside the flow (the arrangement follows
// Flowist's Round info view in its right rail, by Elli; used with permission).

export function RoundInfoPanel({ meta, hasServer, onClose }: { meta: DocMeta; hasServer: boolean; onClose: () => void }) {
  const accepted = meta.partners?.length ?? 0;
  const pending = meta.pendingPartners?.length ?? 0;
  const declined = meta.declinedPartners?.length ?? 0;
  const [doc, setDoc] = useState<Y.Doc | null>(null);
  useEffect(() => {
    const { doc: d, ready } = acquireDoc(meta.id);
    let live = true;
    void ready.then(() => live && setDoc(d));
    return () => {
      live = false;
      setDoc(null);
      releaseDoc(meta.id);
    };
  }, [meta.id]);
  const resolution = useResolution(doc);
  return (
    <aside className="round-info" aria-label="Round info">
      <div className="round-info-head">
        <strong>Round info</strong>
        <button type="button" className="icon-btn small" aria-label="Close round info" onClick={onClose}>
          <IconClose />
        </button>
      </div>
      <dl>
        {resolution && (
          <>
            <dt>Resolution</dt>
            <dd className="round-info-res">{resolution}</dd>
          </>
        )}
        <dt>Name</dt>
        <dd>{meta.title || 'Untitled'}</dd>
        <dt>Kind</dt>
        <dd>
          {formatOf(meta) === 'flow' ? 'Flow' : 'Document'}
          {meta.round ? ' · round (typing recorded, paste blocked)' : ' · prep'}
        </dd>
        {meta.roundLabel && (
          <>
            <dt>Round</dt>
            <dd>{meta.roundLabel}</dd>
          </>
        )}
        {meta.tournamentName && (
          <>
            <dt>Tournament</dt>
            <dd>{meta.tournamentName}</dd>
          </>
        )}
        <dt>Started</dt>
        <dd>{new Date(meta.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</dd>
        {hasServer && meta.teamId !== undefined && (
          <>
            <dt>Partners</dt>
            <dd>
              {accepted} joined{pending ? `, ${pending} invited` : ''}
              {declined ? `, ${declined} declined` : ''}
            </dd>
          </>
        )}
      </dl>
      {hasServer && meta.teamId && !meta.round && (
        <div className="round-info-actions">
          <PartnersButton meta={meta} />
        </div>
      )}
      {hasServer && meta.round && (
        <div className="round-info-actions">
          <PartnersButton meta={meta} />
          <CheckLinkButton meta={meta} />
        </div>
      )}
      {!meta.round && <p className="muted small">Turn on “Round doc” in the window's header to record typing and block paste for a round.</p>}
    </aside>
  );
}
